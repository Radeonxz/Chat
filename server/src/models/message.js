import _ from 'lodash'
import { OrderedMap } from 'immutable'
import { ObjectID } from 'mongodb'

export default class Message {
  constructor(app) {
    this.app = app;
    this.message = new OrderedMap();
  }

  getChannelMessages(channelId, limit = 50, offset = 0) {
    return new Promise((resolve, reject) => {
      channelId = new ObjectID(channelId);
        this.app.db.collection('messages').find({channelId: channelId}).skip(offset).limit(limit).toArray((err, messages) => {
          return err ? reject(err) : resolve(messages);
      });
    })
  }

  create(obj) {
    return new Promise((resolve, reject) => {
      let id = _.get(obj, '_id', null);
      id = _.toString(id);
      const userId = new ObjectID(_.get(obj, 'userId'));
      const channelId = new ObjectID(_.get(obj, 'channelId'));

      const message = {
        _id: new ObjectID(id),
        body: _.get(obj, 'body', ''),
        userId: userId,
        channelId: channelId,
        created: new Date(),
      }

      this.app.db.collection('messages').insertOne(message, (err, info) => {
        if(err) {
          return reject(err);
        }

        // Update last message field to channel
        this.app.db.collection('channels').findOneAndUpdate({_id: channelId}, {
          $set: {
            lastMessage: _.get(message, 'body', ''),
            updated: new Date(),
          }
        });

        this.app.models.user.load(_.toString(userId)).then((user) => {
          _.unset(user, 'password');
          _.unset(user, 'email');
          message.user = user;
          
          return resolve(message);
        }).catch((err) => {
          return reject(err);
        });
      });
    });
  }
}