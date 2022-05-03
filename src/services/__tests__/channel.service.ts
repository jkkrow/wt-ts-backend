import { HydratedDocument } from 'mongoose';

import { connectDB, closeDB } from '../../test/db';
import * as ChannelService from '../channel.service';
import * as UserService from '../user.service';
import { User, Channel } from '../../models/user';

describe('ChannelService', () => {
  let user: HydratedDocument<User>;

  beforeAll(async () => {
    await connectDB();
    user = await UserService.create(
      'native',
      'Test',
      'test@example.com',
      'password'
    );
  });
  afterAll(closeDB);

  describe('find', () => {
    it('should return a channels and count', async () => {
      const result = await ChannelService.find({});

      expect(Object.keys(result)).toMatchObject(['channels', 'count']);
    });

    it('channel item should have videos, subscribers, and isSubscribed properties', async () => {
      const result = await ChannelService.find({});
      const channel = result.channels[0] as Channel;

      expect(Object.keys(channel)).toEqual(
        expect.arrayContaining(['videos', 'subscribers', 'isSubscribed'])
      );
    });
  });

  describe('findById', () => {
    it('should be failed if id is invalid', async () => {
      await expect(
        ChannelService.findById({ id: 'asdfasdf', userId: user.id })
      ).rejects.toThrow();
    });
  });

  describe('findBySubscribers', () => {
    it('should return a channels and count', async () => {
      const result = await ChannelService.findBySubscribers({
        page: 1,
        max: 10,
        userId: user.id,
      });

      expect(Object.keys(result)).toMatchObject(['channels', 'count']);
    });
  });

  describe('updateSubscribers', () => {
    it('should add subscriber if not subscribed', async () => {
      const newUser = await UserService.create(
        'native',
        'Test2',
        'test2@example.com',
        'password'
      );

      await ChannelService.updateSubscribers(user.id, newUser.id);
      const updatedUser = (await UserService.findById(user.id)) as User;

      expect(updatedUser.subscribers).toEqual(
        expect.arrayContaining([newUser._id])
      );
    });

    it('should remove subscriber if already subscribed', async () => {
      const newUser = await UserService.create(
        'native',
        'Test3',
        'test3@example.com',
        'password'
      );

      await ChannelService.updateSubscribers(user.id, newUser.id);
      await ChannelService.updateSubscribers(user.id, newUser.id);
      const updatedUser = (await UserService.findById(user.id)) as User;

      expect(updatedUser.subscribers).not.toEqual(
        expect.arrayContaining([newUser._id])
      );
    });
  });
});
