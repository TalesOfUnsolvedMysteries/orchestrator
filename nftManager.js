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


const generateNFT = async (user, imageFile, videoId) => {
  log.info(`[NFT] generating and storing souvenir NFT.`);
  const [sideA, sideB] = await generateMedia(imageFile);
  const { adn, bugName, deathCause, introWords, lastWords, turn, score, achievements } = user.asObject();
  const metadata = await client.store({
    name: `The Big Adventure Show (Pilot) - Participant #${ turn } Record Card`,
    description: `Big Adventure Show Souvenir Card for Participant #${ turn } - Pilot`,
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
  console.log(metadata.embed());
  log.info(`[NFT] NFT generated ipnft: ${ metadata.ipnft }.`);
  return metadata.ipnft;
};

const allocateRewardToken = async (rewardId) => {
  // should persist this reward is already claimed
  const reward = rewards[rewardId];
  reward.image = new File([await fs.promises.readFile(reward.image.file)], reward.name, {type: 'image/png'});
  const metadata = await client.store(reward);
  return metadata.ipnft;
};

module.exports = {
  generateNFT,
  allocateRewardToken
}