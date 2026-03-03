declare module "pako" {
  interface PakoModule {
    gzip(data: Uint8Array): Uint8Array;
  }

  const pako: PakoModule;
  export default pako;
}
