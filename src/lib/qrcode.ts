import QRCode from 'qrcode';

export async function generateQRBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: 'png',
    errorCorrectionLevel: 'M',
    width: 512,
    margin: 2,
  });
}
