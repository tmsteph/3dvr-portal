import { getEphemeralComputeConfig } from '../src/operator/ephemeral-compute.js';
import { getEphemeralMediaConfig } from '../src/operator/ephemeral-media.js';

const textConfig = getEphemeralComputeConfig(process.env);
const mediaConfig = getEphemeralMediaConfig(process.env);

const safe = {
  text: {
    enabled: textConfig.enabled,
    provider: textConfig.provider,
    model: textConfig.model || null,
    hourlyUsd: textConfig.hourlyUsd || null,
    maxJobUsd: textConfig.maxJobUsd,
    maxRuntimeMs: textConfig.maxRuntimeMs,
    auto: textConfig.auto,
    includeContext: textConfig.includeContext,
    allowImages: textConfig.allowImages,
    endpointConfigured: Boolean(textConfig.endpoint),
    tokenConfigured: Boolean(textConfig.token)
  },
  media: {
    enabled: mediaConfig.enabled,
    provider: mediaConfig.provider,
    maxJobUsd: mediaConfig.maxJobUsd,
    maxRuntimeMs: mediaConfig.maxRuntimeMs,
    endpointConfigured: Boolean(mediaConfig.endpoint),
    tokenConfigured: Boolean(mediaConfig.token)
  }
};

console.log(JSON.stringify(safe, null, 2));
