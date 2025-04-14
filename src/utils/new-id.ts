import { NewId, NewIdFactory } from '@models/new-id';
import { v4 as uuidv4 } from 'uuid';

export const makeIdFactory: NewIdFactory = <N extends NewId<any>>() => {
  return () => {
    return uuidv4() as N;
  };
};
