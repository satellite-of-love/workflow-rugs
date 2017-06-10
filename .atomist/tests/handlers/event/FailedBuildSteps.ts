import { DirectedMessage } from "@atomist/rug/operations/Handlers";
import {
    EventHandlerScenarioWorld, Given, Then, When,
} from "@atomist/rug/test/handler/Core";

import { Build } from "@atomist/cortex/stub/Build";

Given("the FailedBuild is registered", (w: EventHandlerScenarioWorld) => {
    w.registerHandler("FailedBuild");
});

When("a new Build is received", (w: EventHandlerScenarioWorld) => {
    const event = new Build();
    w.sendEvent(event);
});

Then("the FailedBuild event handler should respond with the correct message",
    (w: EventHandlerScenarioWorld) => {
        const expected = `Build event received`;
        const message = (w.plan().messages[0] as DirectedMessage).body;
        return message === expected;
    },
);
