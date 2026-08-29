export function shouldNotifyForChatPublish(input = {}) {
  return input.backfill !== true;
}
