const fs = require('fs');
const jimp = require('jimp');
const { NFTStorage, File } = require('nft.storage');
const log = require('./log');

const client = new NFTStorage({ token: process.env.NFT_STORAGE_KEY });
const rewards = require('./rewards.json');

const generateMedia = async (file) => {
  const fullPath = `${ process.env.NFT_MEDIA_PATH }/${ file }`;
  console.log(fullPath);
  const sides = [fullPath.replace('.png', 'A.png'), fullPath.replace('.png', 'B.png')];
  const img = await jimp.read(fullPath);
  await img.clone()
     .crop(0,20,320,320)
     .writeAsync(sides[0]);
  await img.crop(320,20,320,320)
     .writeAsync(sides[1]);
  return sides;
};

const getComplementaryMetadata = (metadata) => {
  return {
    title: metadata.data.name,
    description: metadata.data.description,
    media: metadata.data.image.hostname + metadata.data.image.pathname,
    media_hash: '',
    copies: '1',
    issued_at: '',
    expires_at: '',
    starts_at: '',
    updated_at: '',
    extra: '',
    reference: metadata.ipnft+'/metadata.json',
    reference_hash: ''
  };
};

const generateNFT = async (user, imageFile, videoId) => {
  log.info(`[NFT] generating and storing souvenir NFT.`);
  const [sideA, sideB] = await generateMedia(imageFile);
  const { adn, bugName, deathCause, introWords, lastWords, turn, score, achievements } = user.asObject();
  const fullMetadata = await client.store({
    name: `Participant #${ turn } Memory Card`,
    description: `Tales of Unsolved Mysteries Memory Card for Participant #${ turn } - Pilot`,
    image: new File([await fs.promises.readFile(sideA)],
      `BAS_Pilot_${ turn }A.png`,
      { type: 'image/png' }
    ),
    properties: {
      adn,
      turn,
      deathCause,
      bugName,
      lastWords,
      introWords,
      type: 'Souvenir Card',
      video: `https://media.thetavideoapi.com/${ videoId }/master.m3u8`,
      sideB: new File([await fs.promises.readFile(sideB)],
        `BAS_Pilot_${ turn }B.png`,
        { type: 'image/png' }
      ),
      score,
      achievements,
      season: 'pilot'
    }
  });
  console.log(fullMetadata);
  console.log(fullMetadata?.data);
  console.log(fullMetadata?.data?.image);
  const metadataObj = fullMetadata.embed();
  console.log(metadataObj);
  log.info(`[NFT] NFT generated ipnft: ${ fullMetadata.ipnft }.`);
  
  return getComplementaryMetadata(fullMetadata);
};

const allocateRewardToken = async (rewardId) => {
  // should persist this reward is already claimed
  const reward = rewards[rewardId];
  reward.image = new File([await fs.promises.readFile(reward.image.file)], reward.name, {type: 'image/png'});
  const metadata = await client.store(reward);
  const metadataObj = metadata.embed();
  return getComplementaryMetadata(metadata);
};

module.exports = {
  generateNFT,
  allocateRewardToken
}