const AWSXRay = require('aws-xray-sdk-core');

function injectTraceHeader(headers) {
  const segment = AWSXRay.getSegment && AWSXRay.getSegment();
  if (segment && segment.trace_id && segment.id) {
    headers['X-Amzn-Trace-Id'] = `Root=${segment.trace_id};Parent=${segment.id};Sampled=1`;
  }
}

module.exports = {
  injectTraceHeader,
}; 