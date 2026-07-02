import type { AvatarStateChangedPayload } from '@pico/protocol';

export const initialAvatarState: AvatarStateChangedPayload = {
  mode: 'everyday',
  state: 'idle',
  intensity: 'normal',
  statusColor: 'neutral',
  message: 'Pico is ready.',
};
