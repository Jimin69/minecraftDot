import { gunzipSync } from "zlib";
import generateWorldEditSchematic from "src/Feature/Editor/functions/generateWorldEditSchematic";

enum TagType {
  End = 0,
  Byte = 1,
  Short = 2,
  Int = 3,
  ByteArray = 7,
  String = 8,
  List = 9,
  Compound = 10,
  IntArray = 11,
}

const readString = (bytes: Uint8Array, offset: number) => {
  const length = (bytes[offset] << 8) | bytes[offset + 1];
  const start = offset + 2;
  const end = start + length;
  return {
    value: new TextDecoder().decode(bytes.slice(start, end)),
    nextOffset: end,
  };
};

const readInt = (bytes: Uint8Array, offset: number) => {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >> 0;
};

const skipTagPayload = (bytes: Uint8Array, type: TagType, offset: number): number => {
  switch (type) {
    case TagType.Byte:
      return offset + 1;
    case TagType.Short:
      return offset + 2;
    case TagType.Int:
      return offset + 4;
    case TagType.String: {
      const { nextOffset } = readString(bytes, offset);
      return nextOffset;
    }
    case TagType.ByteArray: {
      const length = readInt(bytes, offset);
      return offset + 4 + length;
    }
    case TagType.IntArray: {
      const length = readInt(bytes, offset);
      return offset + 4 + length * 4;
    }
    case TagType.List: {
      const childType = bytes[offset] as TagType;
      const length = readInt(bytes, offset + 1);
      let cursor = offset + 5;
      for (let i = 0; i < length; i++) {
        cursor = skipTagPayload(bytes, childType, cursor);
      }
      return cursor;
    }
    case TagType.Compound: {
      let cursor = offset;
      while (bytes[cursor] !== TagType.End) {
        const childType = bytes[cursor] as TagType;
        const nameResult = readString(bytes, cursor + 1);
        cursor = skipTagPayload(bytes, childType, nameResult.nextOffset);
      }
      return cursor + 1;
    }
    default:
      throw new Error(`Unsupported tag type ${String(type)}`);
  }
};

const getRootShortTag = (bytes: Uint8Array, tagName: string): number | undefined => {
  // Root header: Compound + root name
  let cursor = 1;
  cursor = readString(bytes, cursor).nextOffset;

  while (bytes[cursor] !== TagType.End) {
    const type = bytes[cursor] as TagType;
    const name = readString(bytes, cursor + 1);

    if (name.value === tagName && type === TagType.Short) {
      return (bytes[name.nextOffset] << 8) | bytes[name.nextOffset + 1];
    }

    cursor = skipTagPayload(bytes, type, name.nextOffset);
  }

  return undefined;
};

test("schematic export defaults to upright dimensions", async () => {
  const blueprint = [
    ["minecraft:white_wool", "minecraft:black_wool"],
    ["minecraft:black_wool", "minecraft:white_wool"],
    ["minecraft:white_wool", "minecraft:white_wool"],
  ];

  const blob = generateWorldEditSchematic(blueprint);
  const compressed = new Uint8Array(await blob.arrayBuffer());
  const nbtBytes = gunzipSync(compressed);

  expect(getRootShortTag(nbtBytes, "Width")).toBe(2);
  expect(getRootShortTag(nbtBytes, "Height")).toBe(3);
  expect(getRootShortTag(nbtBytes, "Length")).toBe(1);
});
