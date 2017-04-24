import { Given, When, Then, HandlerScenarioWorld, CommandHandlerScenarioWorld } from "@atomist/rug/test/handler/Core"
import { ResponseMessage } from '@atomist/rug/operations/Handlers'

Given("nothing", f => { });

When("the MoveIssue is invoked", (world: HandlerScenarioWorld) => {
    let w: CommandHandlerScenarioWorld = world as CommandHandlerScenarioWorld;
    let handler = w.commandHandler("MoveIssue");
    w.invokeHandler(handler, {});
});

Then("you get the right response", (world: HandlerScenarioWorld) => {
    let w: CommandHandlerScenarioWorld = world as CommandHandlerScenarioWorld;
    const expected = "Successfully ran MoveIssue: default value";
    const message = (w.plan().messages[0] as ResponseMessage).body;
    return message == expected;
});