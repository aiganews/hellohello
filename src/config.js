import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export async function loadAwsSecrets() {
  const secretName = process.env.AWS_SECRETS_NAME;
  const region = process.env.AWS_REGION || 'us-east-1';
  if (!secretName) {
    return;
  }

  const client = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({ SecretId: secretName });

  try {
    const response = await client.send(command);
    const secretString = response.SecretString;
    if (!secretString) {
      console.warn(`AWS Secrets Manager secret ${secretName} is empty.`);
      return;
    }

    let secretValues;
    try {
      secretValues = JSON.parse(secretString);
    } catch (error) {
      console.warn(`Unable to parse secret JSON from ${secretName}:`, error.message);
      return;
    }

    for (const [key, value] of Object.entries(secretValues)) {
      if (value !== undefined && value !== null && !process.env[key]) {
        process.env[key] = String(value);
      }
    }
  } catch (error) {
    console.warn(`Unable to load AWS Secrets Manager secret ${secretName}:`, error.message);
  }
}
