import { useSyncExternalStore } from 'react';

const mq = window.matchMedia('(min-width: 768px)');
const subscribe = (cb: () => void) => {
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

export const useIsDesktop = () => useSyncExternalStore(subscribe, () => mq.matches);
