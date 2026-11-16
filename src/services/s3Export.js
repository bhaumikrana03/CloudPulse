const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock-key',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock-secret'
  }
});

async function exportMetricsToS3(metricsData) {
  const fileName = `metrics-export-${Date.now()}.json`;
  const uploadParams = {
    Bucket: process.env.AWS_S3_BUCKET || 'cloudpulse-telemetry-bucket',
    Key: `exports/${fileName}`,
    Body: JSON.stringify(metricsData, null, 2),
    ContentType: 'application/json'
  };

  try {
    if (process.env.NODE_ENV === 'test') {
      return { success: true, key: uploadParams.Key };
    }
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);
    return { success: true, key: uploadParams.Key };
  } catch (error) {
    console.error('S3 Export Error:', error);
    throw new Error('Failed to upload metrics report to S3');
  }
}

module.exports = { exportMetricsToS3 };
