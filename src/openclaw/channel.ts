import plugin from './plugin.js';

export default {
  id: 'deltachat',
  name: 'Delta Chat',
  description: 'Delta Chat channel plugin for OpenClaw',
  register(api: any) {
    api.registerChannel({ plugin });
  },
};
