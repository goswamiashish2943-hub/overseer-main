try {
  console.log('Requiring uuid...');
  const uuid = require('uuid');
  console.log('UUID exports:', Object.keys(uuid));
  const { v4: uuidv4 } = uuid;
  if (!uuidv4) throw new Error('uuidv4 is undefined');
  console.log('Generating UUID:', uuidv4());
  console.log('UUID test successful!');
} catch (err) {
  console.error('FAILED UUID TEST:');
  console.error(err);
}
