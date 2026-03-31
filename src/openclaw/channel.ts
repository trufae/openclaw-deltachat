import plugin from './plugin.js';

interface ChannelApi {
  registerChannel(opts: { plugin: typeof plugin }): void;
}

export default {
  id: 'deltachat',
  name: 'Delta Chat',
  description: 'Delta Chat channel plugin for OpenClaw',
  register(api: ChannelApi) {
    api.registerChannel({ plugin });
  },
};
