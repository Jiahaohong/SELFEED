import { getChannelByName } from './channelRegistry.mjs';

export const runChannel = async (name, params = {}) => {
  const channel = getChannelByName(name);
  if (!channel) {
    throw new Error(`Channel not found: ${name}`);
  }
  return channel.execute(params);
};
