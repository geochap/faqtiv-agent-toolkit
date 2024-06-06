export function encodeBase64(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

export function decodeBase64(data) {
  return JSON.parse(Buffer.from(data, 'base64').toString());
}