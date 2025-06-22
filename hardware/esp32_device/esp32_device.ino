#include <Arduino.h>
#include <BleGamepad.h>

const int X_BUTTON = 1;

const int NUM_BUTTONS = 13;

const int ultrasonicBuzzPin = 22;
const int buttonLedPin = 18;
const int ultrasonicTrigPin = 15;
const int ultrasonicEchoPin = 21;
const int buttonPin = 23;

int currentBuzz = 1500;

BleGamepad gamepad{ "Ellie Remote", "Ellie", 100 };

void setup() {
  Serial.begin(115200);

  pinMode(ultrasonicBuzzPin, OUTPUT);
  pinMode(buttonLedPin, OUTPUT);
  pinMode(ultrasonicTrigPin, OUTPUT);
  pinMode(ultrasonicEchoPin, INPUT);
  pinMode(buttonPin, INPUT);

  BleGamepadConfiguration gamepadConfig;
  gamepadConfig.setAutoReport(false);
  gamepadConfig.setControllerType(CONTROLLER_TYPE_GAMEPAD);

  gamepadConfig.setButtonCount(NUM_BUTTONS);

  gamepad.begin(&gamepadConfig);

  tone(ultrasonicBuzzPin, 1000, 2000);
}

void loop() {
  // put your main code here, to run repeatedly:
  const int buttonState = digitalRead(buttonPin);
  if (buttonState == HIGH) {
    digitalWrite(buttonLedPin, LOW);
  } else {
    digitalWrite(buttonLedPin, LOW);
  }

  digitalWrite(ultrasonicTrigPin, LOW);
  delay(2);

  digitalWrite(ultrasonicTrigPin, HIGH);
  delay(10);
  digitalWrite(ultrasonicTrigPin, LOW);

  float timeTaken = pulseIn(ultrasonicEchoPin, HIGH);
  float distance = (timeTaken * 0.034) / 2;

  if (distance <= 40) {
    // digitalWrite(ultrasonicLedPin, HIGH);
    tone(ultrasonicBuzzPin, currentBuzz);

    currentBuzz -= 40;

    if (currentBuzz == 500) {
      currentBuzz = 1500;
    }
  } else {
    // digitalWrite(ultrasonicLedPin, LOW);
    noTone(ultrasonicBuzzPin);
  }

  if (gamepad.isConnected()) {
    if (buttonState == LOW) {
      gamepad.press(X_BUTTON);
    } else {
      gamepad.release(X_BUTTON);
    }

    gamepad.sendReport();

    delay(8);
  }
}
