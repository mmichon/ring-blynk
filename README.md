# ring-blynk
This Node.js app interfaces with a Ring video doorbell to send doorbell rings and motion sensing events to a Blynk app or Blynk-connected devices like microcontrollers.

### Features
* Responds to Ring 'ding' and motion events
* Sets the state of a button in a Blynk app which shows whether the Ring doorbell has been rung recently
* Sends a push notification when the doorbell has been rung
* Send events to Blynk to do perform additional functions, for instance, opening and closing a gate lock automatically.
* Waits for the video from the Ring doorbell event and sends it to the Blynk video widget to show the video.
* Interfaces with another web service to do something, for instance, capture a still image from another camera and set the Blynk image app to show this image.

### Setup
1. `npm install ring-api`
1. `npm install blynk-library`
1. Edit `config.js` and set all credentials and settings to that of your own Ring doorbell and Blynk app
1. `node ring-blynk.js`
