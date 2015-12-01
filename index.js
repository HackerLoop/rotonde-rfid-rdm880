'use strict';

let newClient = require('rotonde-client/src/Client');

let client = newClient('ws://rotonde:4224/');

const tty = '/dev/tty.usbserial-AH02LTLV';
const baud = 115200;
const period = 1000;

let openaction = {
  port: tty,
  baud: baud,
};

let scanned = false;
let RFID_tag = '';


client.eventHandlers.attach('SERIAL_READ', (event) => {
  
   //Check is data comes from RFID port
  if(event.data.port !== tty){
    //console.log(event);
    return;
  }

  let packet_data = new Buffer(event.data.data , 'base64');
  let hex_data = packet_data.toString('hex');
  console.log(hex_data);  

  if(hex_data.startsWith( 'aa')) {
    hex_data = hex_data.slice(2, hex_data.length);
    RFID_tag = '';
    scanned = false;
  }
  if(hex_data.endsWith( 'bb' )) {
    hex_data = hex_data.slice(0, hex_data.length-2);
    scanned = true;
  }

  RFID_tag += hex_data;

  if(scanned) {
    scanned = false;
    check_rfid_data(RFID_tag);
    RFID_tag = '';
  }

});


//definitions of module events
client.addLocalDefinition('event' , 'RFID_RECEIVED' , [
    {
      name: 'tag',
      type: 'string',
    },
  ]);

//Check data integrity
function check_rfid_data(tag) {

  //Recover the diferent parts of the message
  let station_id = parseInt(tag.substr(0 , 2) ,16);
  let length = parseInt(tag.substr(2 , 2) , 16);
  let status = parseInt(tag.substr(4 , 2) , 16);
  let flag = parseInt(tag.substr(6 , 2),16);
  let data = tag.substr(8 , 2*(length-2));
  let BCC = parseInt(tag.substr(6 + 2*(length-1) ,2) ,16);

  console.log(tag, station_id , length , status , flag, data , BCC);

  //check that the packet is ok
  if(status !== 0 || tag.length != 2*length + 6){
    if( length == 2 ){
    console.log("No card in front of reader");
    } else {
        console.log("error in packet");
      }
    console.log(length , status , tag.length);
    return;
  }

  if(flag !== 0){
    if(flag == 1) {
    console.log("Error : more than one card in front of reader");
    } else {
      console.log("Unknown data flag error");
    } 
    return;
  }  

  //Calculate checksum
  let checksum = 0;
  for (let i = 0; i < tag.length-2; i+=2) { 
    let temp = parseInt(tag.substr(i , 2) , 16);
    checksum = checksum ^ temp;
  }

  if(checksum === BCC){
    console.log("checksum ok");
    send_rfid_event(data);
  } else {
    console.log("checksum not ok");
  }
}

//send RFID event to rotonde
function send_rfid_event(tag) {

  client.sendEvent('RFID_RECEIVED' , {tag: tag});
  console.log("RFID RECEIVED : " + tag);
}

function askRFIDTags() {
  client.sendAction('SERIAL_WRITE' , {port: tty, data:"qgADJVIBdbs="});
  console.log("Pinged RFID");
}

//definitions of module events
client.addLocalDefinition('event' , 'RFID_RECEIVED' , [
    {
      name: 'tag',
      type: 'string',
    },
  ]);

function openport() {
  client.bootstrap({'SERIAL_OPEN': openaction}, ['SERIAL_STATUS'] , ['SERIAL_READ']).then((events) => {
    let serialOutputEvent = events[0].data;
    if (serialOutputEvent.status == 'SUCCESS') {
      console.log('port open, start lasking for tags');
      setInterval(askRFIDTags, period);
    } else {
      console.log('Could not open opert, quitting');
      process.exit(1);
    }
  }, (error) => {
    console.log('error', error);
  });
}

client.onReady(() => {
  client.bootstrap({'SERIAL_CLOSE': {port:tty}}, [] , ['SERIAL_STATUS']).then((events) => {
    console.log('sent close');
    //Wait for the serial module to close the connection if already open (1s delay)
    client.eventHandlers.makePromise('SERIAL_STATUS' , 1500).then( openport , openport);
  }, (error) => {
    console.log('error', error);
  });
});

client.connect();

