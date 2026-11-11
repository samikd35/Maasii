import QRCode from "qrcode";

export async function qrPng(url: string): Promise<Uint8Array> {
  return new Uint8Array(await QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "M", margin: 4, width: 720 }));
}
