import pako from "pako";

const enum TagType {
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

class NbtWriter {
  private bytes: number[] = [];

  private writeByte(value: number) {
    this.bytes.push((value + 256) & 0xff);
  }

  private writeShort(value: number) {
    this.bytes.push((value >> 8) & 0xff, value & 0xff);
  }

  private writeInt(value: number) {
    this.bytes.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  }

  private writeStringRaw(value: string) {
    const encoded = new TextEncoder().encode(value);
    this.writeShort(encoded.length);
    this.bytes.push(...encoded);
  }

  private writeNamedTagHeader(type: TagType, name: string) {
    this.writeByte(type);
    this.writeStringRaw(name);
  }

  writeRootCompound(name: string, writeBody: () => void) {
    this.writeNamedTagHeader(TagType.Compound, name);
    writeBody();
    this.writeByte(TagType.End);
  }

  writeShortTag(name: string, value: number) {
    this.writeNamedTagHeader(TagType.Short, name);
    this.writeShort(value);
  }

  writeIntTag(name: string, value: number) {
    this.writeNamedTagHeader(TagType.Int, name);
    this.writeInt(value);
  }

  writeStringTag(name: string, value: string) {
    this.writeNamedTagHeader(TagType.String, name);
    this.writeStringRaw(value);
  }

  writeByteArrayTag(name: string, values: Uint8Array) {
    this.writeNamedTagHeader(TagType.ByteArray, name);
    this.writeInt(values.length);
    this.bytes.push(...values);
  }

  writeIntArrayTag(name: string, values: number[]) {
    this.writeNamedTagHeader(TagType.IntArray, name);
    this.writeInt(values.length);
    values.forEach((value) => this.writeInt(value));
  }

  writeListTag(name: string, childType: TagType, length: number) {
    this.writeNamedTagHeader(TagType.List, name);
    this.writeByte(childType);
    this.writeInt(length);
  }

  writeCompoundTag(name: string, writeBody: () => void) {
    this.writeNamedTagHeader(TagType.Compound, name);
    writeBody();
    this.writeByte(TagType.End);
  }

  asUint8Array() {
    return new Uint8Array(this.bytes);
  }
}

const encodeVarInt = (value: number): number[] => {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    let temp = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (remaining !== 0);
  return bytes;
};

const generateWorldEditSchematic = (blueprint: string[][]): Blob => {
  const height = blueprint.length;
  const width = blueprint[0].length;

  const palette = new Map<string, number>();
  const blockIndices: number[] = [];

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const blockId = blueprint[z][x];
      if (!palette.has(blockId)) palette.set(blockId, palette.size);
      blockIndices.push(palette.get(blockId)!);
    }
  }

  const blockDataBytes = new Uint8Array(blockIndices.flatMap((index) => encodeVarInt(index)));

  const writer = new NbtWriter();
  writer.writeRootCompound("Schematic", () => {
    writer.writeIntTag("Version", 2);
    writer.writeIntTag("DataVersion", 3465);
    writer.writeShortTag("Width", width);
    writer.writeShortTag("Height", 1);
    writer.writeShortTag("Length", height);
    writer.writeIntArrayTag("Offset", [0, 0, 0]);
    writer.writeIntTag("PaletteMax", palette.size);
    writer.writeCompoundTag("Palette", () => {
      palette.forEach((index, blockId) => {
        writer.writeIntTag(blockId, index);
      });
    });
    writer.writeByteArrayTag("BlockData", blockDataBytes);
    writer.writeListTag("BlockEntities", TagType.Compound, 0);
    writer.writeListTag("Entities", TagType.Compound, 0);
    writer.writeCompoundTag("Metadata", () => {
      writer.writeStringTag("Author", "minecraftDot");
    });
  });

  const compressed = pako.gzip(writer.asUint8Array());
  return new Blob([compressed], { type: "application/octet-stream" });
};

export default generateWorldEditSchematic;
