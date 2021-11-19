#!/usr/bin/env node
require('dotenv').config();
const { Command } = require('commander');
const program = new Command();
program.version('0.1.0');

let contract;
const getContract = async () => {
  if (!contract) {
    const thetaConnector = require('./thetaConnector');
    await thetaConnector.init();
    contract = thetaConnector.getContract();
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
        const tx = await _contract[setMethod](value, { gasLimit: '500000'});
        const receipt = await tx.wait();
        console.log(`transaction executed hash: ${ receipt.transactionHash }`);
        console.log(`gas used = ${ receipt.cumulativeGasUsed } at ${ receipt.effectiveGasPrice } price.`);
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

program.command('premium_accessory <id> [price] [points]')
.description('sets the price for a premium accesory')
.action(async (id, price, points) => {
  try {
    const _contract = await getContract();
    const isGetCall = !price || !points;
    if (isGetCall) {
      const _price = await _contract.accessories_prices(id, { gasLimit: '500000'});
      const _points = await _contract.accessories_prices_points(id, { gasLimit: '500000'});
      console.log(`Premium Accessory #${ id }: price= ${ _price } - points= ${ _points }`);
    } else {
      const tx = await _contract.setPriceForAccessory(id, price, points, { gasLimit: '500000'});
      const receipt = await tx.wait();
      console.log(`transaction executed hash: ${ receipt.transactionHash }`);
      console.log(`gas used = ${ receipt.cumulativeGasUsed } at ${ receipt.effectiveGasPrice } price.`);
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

createCommand(
  'user_price [price]',
  'sets/gets the price to unlock a user',
  'price_to_unlock_user',
  'setPriceToUnlockUser'
);

createCommand(
  'max_points [points]',
  'sets/gets the max points a player can win by one transaction',
  null,
  'setMaxPointsReward'
);

createCommand(
  'max_line [length]',
  'max players on line',
  null,
  'setMaxLineCapacity'
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

/* for user
createCommand(
  'unlock_accessory <id>',
  'removes an accesory public for everybody',
  undefined,
  'unlockAccessoryForUser'
);
*/



program.parse(process.argv);
