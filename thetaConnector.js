const { ethers, Contract, Wallet } = require('ethers');
const bugShowArtifact = require('./artifacts/bugShow.json');

let _contract;
let listeners = {};
const networkConfig = {
  local_hardhat: {
    url: 'http://127.0.0.1:8545/',
    contractAddress: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  },
  theta_privatenet: {
    url: 'http://127.0.0.1:18888/rpc',
    contractAddress: '0x52d2878492EF30d625fc54EC52c4dB7f010d471e',
    chainId: 366,
  },
  theta_testnet: {
      url: 'https://eth-rpc-api-testnet.thetatoken.org/rpc',
      contractAddress: '',
      chainId: 365,
  },
  theta_mainnet: {
      url: 'https:1//eth-rpc-api.thetatoken.org/rpc',
      contractAddress: '',
      chainId: 361,
  },
};

const init = async () => {
  const { url, contractAddress } = networkConfig[process.env.NETWORK];
  const provider = new ethers.providers.JsonRpcProvider(url);
  const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
  _contract = new Contract(contractAddress, bugShowArtifact.abi, wallet);
  _contract.on('userAllocated', (sessionID, userID) => {
    console.log('user allocated event', sessionID, userID);
    if (listeners['userAllocated'] && listeners['userAllocated'][sessionID]) {
      listeners['userAllocated'][sessionID](userID);
    }
  });
  _contract.on('turnAssigned', (userID, turn) => {
    console.log('turn assigned to user event', userID, turn);
    if (listeners['turnAssigned'] && listeners['turnAssigned'][userID]) {
      listeners['turnAssigned'][userID](turn);
    }
  });
  _contract.on('linePeeked', (userID) => {
    console.log('first user removed from line event', userID);
    if (listeners['linePeeked'] && listeners['linePeeked']['_']) {
      listeners['turnAssigned']['_'](userID);
    }
  });
  _contract.on('tokenRewarded', (userID, tokenId) => {
    console.log('token rewarded to player', userID, tokenId);
    if (listeners['tokenRewarded'] && listeners['tokenRewarded'][userID]) {
      listeners['tokenRewarded'][userID](tokenId);
    }
  });
  _contract.on('pointsRewarded', (userID, points) => {
    console.log('points rewarded to player -> total:', userID, points);
    if (listeners['pointsRewarded'] && listeners['pointsRewarded'][userID]) {
      listeners['pointsRewarded'][userID](points);
    }
  });
};

const getContract = () => {
  return _contract;
}

const addEventListener = (eventName, key, fn) => {
  if (!listeners[eventName]) {
    listeners[eventName] = {};
  }
  listeners[eventName][key] = fn;
};

const removeEventListener = (eventName, key) => {
  delete listeners[eventName][key];
}


const allocateUser = async(sessionID, secretWord) => {
  if (!_contract) throw Error('not connected to theta network');
  const encodedKey = ethers.utils.solidityKeccak256(['string'],[secretWord]);
  const userID = await new Promise(async (resolve) => {
    addEventListener('userAllocated', sessionID, resolve);
    const tx = await _contract.allocateUser(sessionID, encodedKey, { gasLimit: '500000'});
    await tx.wait();
  });
  removeEventListener('userAllocated', sessionID);
  return { userID, encodedKey };
};

const addToLine = async (userID) => {
  if (!_contract) throw Error('not connected to theta network');
  const turn = await new Promise(async (resolve) => {
    addEventListener('turnAssigned', userID, resolve);
    const tx = await _contract.addToLine(userID, { gasLimit: '500000'});
    await tx.wait();
  });
  removeEventListener('turnAssigned', userID);
  return turn;
};

const peek = async () => {
  if (!_contract) throw Error('not connected to theta network');
  const removedUserID = await new Promise(async (resolve) => {
    addEventListener('linePeeked', '_', resolve);
    const tx = await _contract.peek({ gasLimit: '500000'});
    await tx.wait();
  });
  removeEventListener('linePeeked', '_');
  return removedUserID;
};

const rewardGameToken = async (userID, nftUrl) => {
  if (!_contract) throw Error('not connected to theta network');
  const tokenReward = await new Promise(async (resolve) => {
    addEventListener('tokenRewarded', userID, resolve);
    const tx = await _contract.rewardGameToken(userID, nftUrl, { gasLimit: '500000'});
    await tx.wait();
  });
  removeEventListener('tokenRewarded', userID);
  return tokenReward;
};

const rewardPoints = async (userID, points) => {
  if (!_contract) throw Error('not connected to theta network');
  const totalPoints = await new Promise(async (resolve) => {
    addEventListener('pointsRewarded', userID, resolve);
    const tx = await _contract.rewardPoints(userID, points, { gasLimit: '500000'});
    await tx.wait();
  });
  removeEventListener('pointsRewarded', userID);
  return totalPoints;
};

module.exports = {
  init,
  getContract,
  allocateUser,
  addToLine,
  peek,
  rewardGameToken,
  rewardPoints,
  addEventListener
};
