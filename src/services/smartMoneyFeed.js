import { EventEmitter } from 'events';

export const smartMoneyEvents = new EventEmitter();
export const smartMoneyFeed = []; // most recent first, capped below
const MAX_FEED_LENGTH = 200;

export function pushSmartMoneyEntry(entry) {
  smartMoneyFeed.unshift(entry);
  if (smartMoneyFeed.length > MAX_FEED_LENGTH) smartMoneyFeed.pop();
  smartMoneyEvents.emit('activity', entry);
}
