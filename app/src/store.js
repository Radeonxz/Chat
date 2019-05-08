import {OrderedMap} from 'immutable'
import _ from 'lodash'
import Service from './service'
import Realtime from './realtime'

// const users = OrderedMap({
//   '1': {_id: '1', email: 'xuan@123.com', name: 'Xuan Zhao VeryLong', created: new Date(), avatar: 'https://api.adorable.io/avatars/100/abott@alex.png'},
//   '2': {_id: '2', email: 'zhao@123.com', name: 'Zhao111111111111111111111', created: new Date(), avatar: 'https://api.adorable.io/avatars/100/abott@bob.png'},
//   '3': {_id: '3', email: 'bob@123.com', name: 'Bob2222222222222222222222', created: new Date(), avatar: 'https://api.adorable.io/avatars/100/abott@john.png'},
// });

export default class Store {
  constructor(appComponent) {
    this.app = appComponent;
    this.service = new Service();
    this.messages = new OrderedMap();
    this.channels = new OrderedMap();
    this.activeChannelId = null;
    
    // Current logged in user
    // this.user = {
    //   _id: '1',
    //   name: 'Xuan Zhao VeryLong',
    //   avatar: 'https://api.adorable.io/avatars/100/abott@alex.png',
    //   created: new Date(),
    // }
    this.token = this.getTokenFromLocalStorage();
    this.user = this.getUserFromLocalStorage();
    this.users = new OrderedMap();
    this.search = {
      users: new OrderedMap(),
    }

    this.realtime = new Realtime(this);
  }

  addUserToCache(user) {
    user.avatar = this.loadUserAvatar(user);
    const id =`${user._id}`;
    this.users = this.users.set(id, user);
  }

  getUserTokenId() {
    return _.get(this.token, '_id', null);
  }

  loadUserAvatar(user) {
    return `https://api.adorable.io/avatars/100/${user._id}.png`;
  }

  startSearchUsers(q = '') {
    // query to db and get list of users
    const data = {search: q}
    this.search.users = this.search.users.clear();
    this.service.post('api/users/search', data).then((response) => {
      // searched results
      const users = _.get(response, 'data', []);
      _.each(users, (user) => {
        // cache to this.users

        // add user to this.search.users
        user.avatar = this.loadUserAvatar(user);
        const userId = `${user._id}`;
        this.users = this.users.set(userId, user);
        this.search.users = this.search.users.set(userId, user);
      });

      // update component
      this.update();
    }).catch((err) => {
      console.log('searching error', err);
    })
  }

  setUserToken(accessToken) {
    if(!accessToken) {
      this.localStorage.removeItem('token');
      this.token = null;
      return;
    }
    this.token = accessToken;
    localStorage.setItem('token', JSON.stringify(accessToken));
  }

  getTokenFromLocalStorage() {
    if(this.token) {
      return this.token;
    }

    let token = null;
    const data = localStorage.getItem('token');
    if(data) {
      try {
        token = JSON.parse(data);
      } catch(err) {
        console.log(err);
      }
    }
    return token;
  }

  getUserFromLocalStorage() {
    let user = null;
    const data = localStorage.getItem('me');
    
    try {
      user = JSON.parse(data);
    } catch(err) {
      console.log(err);
    }

    if(user) {
      // api call to backend to verify the current user
      const token = this.getTokenFromLocalStorage();
      const tokenId = _.get(token, '_id');
      const options = {
        headers: {
          authorization: tokenId,
        }
      }
      this.service.get('api/users/me', options).then((response) => {
        // user is logged in with tokenId
        const accessToken = response.data;
        const user = _.get(accessToken, 'user');
        this.setCurrentUser(user);
        this.setUserToken(accessToken);
      }).catch(err => {
        this.signOut();
      });
    }
    return user;
  }

  setCurrentUser(user) {

    // set temporary user avatar image url
    user.avatar = this.loadUserAvatar(user);
    this.user = user;

    if(user) {
      localStorage.setItem('me', JSON.stringify(user));

      // save user to users collections in local storage
      const userId = `${user._id}`;
      this.users = this.users.set(userId, user);
    }
    this.update();
  }

  signOut() {
    const userId = `${_.get(this.user, '_id', null)}`;
    this.user = null;
    localStorage.removeItem('me');
    localStorage.removeItem('token');

    if(userId) {
      this.users = this.users.remove();
    }
    this.update();
  }

  login(email = null, password = null) {
    const userEmail = _.toLower(email);
    // const _this = this;

    const user = {
      email: userEmail,
      password: password,
    }
    console.log('trying to login', user);

    return new Promise((resolve, reject) => {
      // api call to backend to login user
      this.service.post('api/users/login', user).then((response) => {
        // successfully logged in
        const accessToken = _.get(response, 'data');
        console.log('got sth from server', accessToken);

        const user = _.get(accessToken, 'user');
        this.setCurrentUser(user);
        this.setUserToken(accessToken);
      }).catch((err) => {
        // login error
        console.log('got err from server', err);
        const message = _.get(err, 'response.data.error.message', 'Login Error');
        return reject(message);
      });
    });

    // return new Promise((resolve, reject) => {
    //   const user = users.find((user) => user.email === userEmail);
      
    //   if(user) {
    //     _this.setCurrentUser(user);
    //   }
    //   return user ? resolve(user) : reject('User not found');
    // });

    
  }

  removeMemberFromChannel(channel = null, user = null) {
    if(!channel || !user) {
      return;
    }

    const userId = _.get(user, '_id');
    const channelId = _.get(channel, '_id');
    channel.members = channel.members.remove(userId);
    this.channels = this.channels.set(channelId, channel);
    this.update();
  }

  addUserToChannel(channelId, userId) {
    const channel = this.channels.get(channelId);

    if(channel) {
      channel.members = channel.members.set(userId, true);
      this.channels = this.channels.set(channelId, channel);
      this.update();
    }
  }

  getSearchUsers() {
    return this.search.users.valueSeq();
  }

  onCreateNewChannel(channel = {}) {
    const channelId = _.get(channel, '_id');
    this.addChannel(channelId, channel);
    this.setActiveChannelId(channelId);
    // console.log(JSON.stringify(this.channels.toJS()));
  }

  getCurrentUser() {
    return this.user;
  }

  setActiveChannelId(id) {
    this.activeChannelId = id;
    this.update();
  }

  getActiveChannel() {
    const channel = this.activeChannelId ? this.channels.get(this.activeChannelId) : this.channels.first();
    return channel;
  }

  addMessage(id, message = {}) {
    const user = this.getCurrentUser();
    message.user = user;
    this.messages = this.messages.set(id, message);
    const channelId = _.get(message, 'channelId');

    if(channelId){     
      let channel = this.channels.get(channelId);
      
      channel.lastMessage = _.get(message, 'body', '');

      // send this channel info to the server
      const obj = {
        action: 'create_channel',
        payload: channel,
      }
      this.realtime.send(obj);

      channel.messages = channel.messages.set(id, true);      
      channel.isNew = false;
      this.channels = this.channels.set(channelId, channel);
    }

    this.update();
  }
  
  getMessages() {
    return this.messages.valueSeq();
  }

  getMessagesFromChannel(channel) {
    let messages = new OrderedMap();

    if(channel){
      // channel.messages.map((value, key) => {
      //   const message = this.messages.get(key);
      //   messages.push(message);
      // });

      channel.messages.forEach((value, key) => {
        const message = this.messages.get(key);
        messages = messages.set(key, message);
      })
    }

    return messages.valueSeq();
  }

  getMembersFromChannel(channel) {
    let members = new OrderedMap();

    if(channel){
      // channel.members.map((value, key) => {
      //   const user = users.get(key);
      //   const loggedUser = this.getCurrentUser();

      //   if(_.get(loggedUser, '_id') !== _.get(user, '_id')) {
      //     members = members.set(key, user);
      //   }       
      // });

      channel.members.forEach((value, key) => {
        const userId = `${key}`
        const user = this.users.get(userId);
        const loggedUser = this.getCurrentUser();

        if(_.get(loggedUser, '_id') !== _.get(user, '_id')) {
          members = members.set(key, user);
        }
      })
    }

    return members.valueSeq();
  }

  addChannel(index, channel = {}) {
    this.channels = this.channels.set(`${index}`, channel);
    this.update();
  }

  getChannels() {
    //sort channel by date
    this.channels = this.channels.sort((a, b) => a.created < b.created);
    return this.channels.valueSeq();
  }

  update() {
    this.app.forceUpdate();
  }
}