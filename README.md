# ellie

## Inspiration
Not everyone can take take the stairs, and we're here to make sure they can easily find elevators to take instead! 🛗♿

Inspired by our own struggle with finding elevators (and being a bit directionally challenged 🗺️), we set out to take accessibility to the next level!

## What it does
Ellie intelligently analyzes floor plans to identify elevators on a given floor. When a user specifies where they're located, Ellie uses AI to identify a path from the user to the nearest elevator. To make the product useful to all, this path is shown
1. visually
2. with landmark focused written instructions
3. walked through by a voice assistant 

To further help those with visual impairments, Ellie comes with a handheld assistant device to control the voice assistant and warn users if they're approaching an obstacle while navigating. 

## How we built it
We built the frontend using Google AI Studio. The floor plan analysis and path finding is through the Gemini API. We use VAPI to read instructions out loud. Finally, for the hardware, we use ESB-32, ultrasonic sensor, and a buzzer.

## Challenges we ran into
Some of the features we wanted to add were only possible using https (web Bluetooth, and GPS tracking). Since setting up SSL during the 24 hours was challenging, we needed to redesign our final product while making sure the core functionality is not compromised.

## Accomplishments that we're proud of
We're quite proud of the hardware setup, since we're mostly experienced in software, it's always fun to try tinkering with hardware sometimes :)

## What we learned
We learned a lot more about Google's AI Studio and how we can make our development process more efficient with Build

## What's next for Ellie
- better path finding and live GPS tracking
- extend to find things beyond elevators to make indoor navigation a breeze
