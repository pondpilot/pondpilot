import { v4 as uuidv4 } from 'uuid';

import { NewId, NewIdFactory } from '@models/new-id';

export const makeIdFactory: NewIdFactory = <N extends NewId<any>>() => {
  return () => {
    return uuidv4() as N;
  };
};
