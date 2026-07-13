/**
 * Minimal little-endian NBT reader for Minecraft Bedrock's `level.dat`.
 *
 * Bedrock's `level.dat` is NOT a standard Java-edition NBT file: it starts
 * with an 8-byte header (int32 storage version + int32 payload length),
 * followed by an uncompressed, little-endian encoded NBT compound tag.
 *
 * This parser is read-only and best-effort. It is only used to extract a
 * handful of metadata fields (level name, experiment toggles, base game
 * version) for user-facing diagnostics — it never mutates the original
 * bytes, and any parse failure is caught by the caller and surfaced as a
 * soft warning instead of blocking the conversion.
 */

export type NbtValue =
  | number
  | bigint
  | string
  | string[]
  | number[]
  | NbtCompound
  | NbtValue[];

export interface NbtCompound {
  [key: string]: NbtValue;
}

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

class NbtReader {
  private buf: Buffer;
  private offset: number;

  constructor(buf: Buffer) {
    this.buf = buf;
    this.offset = 0;
  }

  private ensure(bytes: number): void {
    if (this.offset + bytes > this.buf.length) {
      throw new Error("Unexpected end of NBT buffer");
    }
  }

  readByte(): number {
    this.ensure(1);
    const v = this.buf.readInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readUByte(): number {
    this.ensure(1);
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readShort(): number {
    this.ensure(2);
    const v = this.buf.readInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  readInt(): number {
    this.ensure(4);
    const v = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  readLong(): bigint {
    this.ensure(8);
    const v = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  readFloat(): number {
    this.ensure(4);
    const v = this.buf.readFloatLE(this.offset);
    this.offset += 4;
    return v;
  }

  readDouble(): number {
    this.ensure(8);
    const v = this.buf.readDoubleLE(this.offset);
    this.offset += 8;
    return v;
  }

  readString(): string {
    const len = this.readShort();
    this.ensure(len);
    const v = this.buf.toString("utf8", this.offset, this.offset + len);
    this.offset += len;
    return v;
  }

  readByteArray(): number[] {
    const len = this.readInt();
    const arr: number[] = [];
    for (let i = 0; i < len; i++) arr.push(this.readByte());
    return arr;
  }

  readIntArray(): number[] {
    const len = this.readInt();
    const arr: number[] = [];
    for (let i = 0; i < len; i++) arr.push(this.readInt());
    return arr;
  }

  readLongArray(): bigint[] {
    const len = this.readInt();
    const arr: bigint[] = [];
    for (let i = 0; i < len; i++) arr.push(this.readLong());
    return arr;
  }

  readTagPayload(tagType: number): NbtValue {
    switch (tagType) {
      case TAG_BYTE:
        return this.readByte();
      case TAG_SHORT:
        return this.readShort();
      case TAG_INT:
        return this.readInt();
      case TAG_LONG:
        return this.readLong();
      case TAG_FLOAT:
        return this.readFloat();
      case TAG_DOUBLE:
        return this.readDouble();
      case TAG_BYTE_ARRAY:
        return this.readByteArray();
      case TAG_STRING:
        return this.readString();
      case TAG_LIST:
        return this.readList();
      case TAG_COMPOUND:
        return this.readCompoundBody();
      case TAG_INT_ARRAY:
        return this.readIntArray();
      case TAG_LONG_ARRAY:
        return this.readLongArray().map((v) => v.toString());
      default:
        throw new Error(`Unsupported NBT tag type: ${tagType}`);
    }
  }

  readList(): NbtValue[] {
    const itemType = this.readUByte();
    const len = this.readInt();
    const items: NbtValue[] = [];
    if (itemType === TAG_END || len <= 0) return items;
    for (let i = 0; i < len; i++) {
      items.push(this.readTagPayload(itemType));
    }
    return items;
  }

  readCompoundBody(): NbtCompound {
    const result: NbtCompound = {};
    for (let guard = 0; guard < 200_000; guard++) {
      const tagType = this.readUByte();
      if (tagType === TAG_END) break;
      const name = this.readString();
      result[name] = this.readTagPayload(tagType);
    }
    return result;
  }
}

/**
 * Parse a raw `level.dat` buffer (including its 8-byte header) into a plain
 * object. Throws on malformed input — callers must catch and treat this as
 * a soft failure, never a fatal one.
 */
export function parseLevelDat(raw: Buffer): NbtCompound {
  if (raw.length < 8) {
    throw new Error("level.dat is too small to contain a valid header");
  }

  const payloadLength = raw.readInt32LE(4);
  const bodyStart = 8;
  const bodyEnd = Math.min(raw.length, bodyStart + Math.max(payloadLength, 0));
  const body = raw.subarray(bodyStart, bodyEnd || raw.length);

  const reader = new NbtReader(body);
  const rootType = reader.readUByte();
  if (rootType !== TAG_COMPOUND) {
    throw new Error("level.dat root tag is not a compound");
  }
  reader.readString();
  return reader.readCompoundBody();
}

export function nbtStorageVersion(raw: Buffer): number | null {
  if (raw.length < 4) return null;
  try {
    return raw.readInt32LE(0);
  } catch {
    return null;
  }
}
