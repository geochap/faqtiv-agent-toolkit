export function encodeBase64(data) {
  const buffer = new Float32Array(data).buffer;
  return Buffer.from(buffer).toString('base64');
}

export function decodeBase64(data) {
  const buffer = Buffer.from(data, 'base64');
  const decodedArray = new Float32Array(buffer);
  return decodedArray;
}