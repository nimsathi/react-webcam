const webdriver = require('selenium-webdriver');
const { Builder, By, Key, until } = webdriver;
const { browserstackUser, browserstackKey } = require('./credentials');
const browserstack = require('browserstack-local');

const capabilities = {
  'acceptSslCerts': true,
  'browserName': 'chrome',
  'realMobile': 'true',
  'browserstack.video' : 'false',
  'browserstack.debug': true,
  'browserstack.user': browserstackUser,
  'browserstack.key': browserstackKey,
  'browserstack.local': true,
  'chromeOptions': {
    'args': [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
};

async function test(device) {
  console.log('---');
  console.log(device);
  let driver;
  try {
    const BS = new browserstack.Local();
    await new Promise(resolve => BS.start({ key: browserstackKey }, resolve));
    driver = new Builder().
      usingServer('http://hub-cloud.browserstack.com/wd/hub').
      withCapabilities({...capabilities, device }).
      build();

    await driver.get('https://0.0.0.0:3333/test/constraints');
    await driver.findElement(By.id('start')).click();
    await driver.wait(until.elementLocated(By.id('results')), 10000);
    const results = await driver.findElement(By.id('results')).then(element => element.getText());
    console.log(results);
    driver.quit();
  } catch (e) {
    console.log('Error.');
    console.log(e);
    driver.quit();
  }
  return true;
}

const devices = [
  'Google Pixel 2',
  'Google Pixel',
  'Google Nexus 6',
  'Google Nexus 9',
  'Samsung Galaxy S6',
  'Samsung Galaxy S7',
  'Samsung Galaxy Note 4',
  'Samsung Galaxy S8',
  'Samsung Galaxy S8 Plus',
  'Samsung Galaxy S9',
  'Samsung Galaxy S9 Plus',
  'Samsung Galaxy Note 8',
  'Samsung Galaxy Tab 4',
];

async function main() {
  devices.reduce((prev, device) => prev.then(() => test(device)), Promise.resolve())
}

main()