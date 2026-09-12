import handler from './growth-engine.mjs';

export default async (req) => handler(req);

export const config = {
  schedule: '0 */6 * * *'
};
