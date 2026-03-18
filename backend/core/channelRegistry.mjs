import rssChannel from '../channels/rssChannel.mjs';
import stockAPIChannel from '../channels/stockAPIChannel.mjs';
import webScrapeChannel from '../channels/webScrapeChannel.mjs';

const channels = [
  rssChannel,
  stockAPIChannel,
  webScrapeChannel
];

const metadataList = channels.map((channel) => channel.metadata);

export const getAllChannels = () => channels;

export const getAllChannelMetadata = () => metadataList;

export const getChannelByName = (name) => channels.find(
  (channel) => channel.metadata?.name === name
) || null;

export default channels;
