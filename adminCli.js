#!/usr/bin/env node
require('dotenv').config();
const { Command } = require('commander');
const program = new Command();
program.version('0.1.0');

let contract;
const getContract = async () => {
  if (!contract) {
    const blockchainConnector = require('./nearConnector');
    await blockchainConnector.init();
    contract = blockchainConnector.getContract();
  }
  return contract;
};

const createCommand = (command, description, getMethod, setMethod) => {
  program.command(command)
  .description(description)
  .action(async (value) => {
    try {
      const _contract = await getContract();
      
      if (!value) {
        if (!getMethod) {
          console.log('this attribute is private');
        } else {
          const _current_value = await _contract[getMethod]();
          console.log(`current value: ${ _current_value.toString() }`);
        }
      } else {
        const res = await _contract[setMethod]({args: value});
        console.log(`res: ${ res.toString() }`);
      }
    } catch (e) {
      if (value) {
        let reason = e.code !== 'SERVER_ERROR' ? e.reason : JSON.parse(e.body)['error']['message'];
        console.log(`setting value error[${ e.code }]: ${ reason } ${ value }`);
      } else {
        console.error(e);
      }
    }
  });
};

program.command('peek')
.description('remove first user from line')
.action(async () => {
  try {
    const _contract = await getContract();
    const lastUser = await _contract.peek({args: {}});
    console.log(`line peeked = ${ lastUser }.`);
  } catch (e) {
    console.error(e);
  }
});

program.command('premium_accessory <id> [price] [points]')
.description('sets the price for a premium accesory')
.action(async (id, price, points) => {
  try {
    const _contract = await getContract();
    const isGetCall = !price || !points;
    if (isGetCall) {
      const accessory = await _contract.getAccessory({accessoryId: id});
      console.log(`Accessory #${ id }:`);
      console.log(accessory);
    } else {
      await _contract.setPriceForAccessory({accessoryId: id, price, pointsPrice: points});
    }
  } catch (e) {
    if (!isGetCall) {
      let reason = e.code !== 'SERVER_ERROR' ? e.reason : JSON.parse(e.body)['error']['message'];
      console.log(`setting price error[${ e.code }]: ${ reason } ${ price } - ${ points }`);
    } else {
      console.error(e);
    }
  }
});

program.command('stats')
.description('sets the price for a premium accesory')
.action(async (max_value) => {
  try {
    const _contract = await getContract();
    const res = await _contract.getGameConfig({});
    console.log(res);
  } catch (e) {
    console.error(e);
  }
});

program.command('set_max_line [max_value]')
.description('sets the price for a premium accesory')
.action(async (max_value) => {
  try {
    const _contract = await getContract();
    await _contract.setMaxLineCapacity({args: {maxLineCapacity: parseInt(max_value)}});
  } catch (e) {
    let reason = e.code !== 'SERVER_ERROR' ? e.reason : JSON.parse(e.body)['error']['message'];
    console.log(`setting price error[${ e.code }]: ${ reason } ${ price } - ${ points }`);
  }
});

createCommand(
  'user_price [price]',
  'sets/gets the price to unlock a user',
  null,
  'setPriceToUnlockUser'
);

createCommand(
  'max_points [points]',
  'sets/gets the max points a player can win by one transaction',
  null,
  'setMaxPointsReward'
);

createCommand(
  'base_uri [url]',
  'base uri for assets',
  '_baseURI',
  'setBaseURI'
);

createCommand(
  'unlock_accessory <id>',
  'makes an accesory public for everybody',
  undefined,
  'unlockAccessoryForPublic'
);

createCommand(
  'lock_accessory <id>',
  'removes an accesory public for everybody',
  undefined,
  'removeAccessoryForPublic'
);



program.parse(process.argv);
