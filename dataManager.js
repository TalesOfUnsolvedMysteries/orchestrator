const { JsonDB } = require('node-json-db');
const { Config } = require('node-json-db/dist/lib/JsonDBConfig');

var db = new JsonDB(new Config("myDataBase", true, false, '/'));

const init = async () => {

}

const saveUser = async (userID, password) => {

  const user = {
    id: userID,
    password,
    address: null,
  }
  db.push(`/users/${ userID }`, user);
};

const updateUser = async (userID, address) => {
  const user = db.getData(`/users/${ userID }`);
  user.address = address;
  db.push(`/users/${ userID }`, user);
};

const getUser = async (userID, password) => {
  try {
    const user = await db.getData(`/users/${ userID }`);
    if (user.password === password) return user;
    return null;
  } catch(e) {
    return null;
  }
};


module.exports = {
  init,
  saveUser,
  getUser,
  updateUser
};

