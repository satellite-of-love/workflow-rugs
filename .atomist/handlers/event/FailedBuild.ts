import { EventHandler, Tags } from "@atomist/rug/operations/Decorators";
import { ChannelAddress, DirectedMessage, EventPlan, HandleEvent } from "@atomist/rug/operations/Handlers";
import { Match } from "@atomist/rug/tree/PathExpression";

import { Build } from "@atomist/cortex/Types";

/**
 * A try to get the log.
 */
@EventHandler("FailedBuild", "try to get the log", "/Build()")
@Tags("documentation")
export class FailedBuild implements HandleEvent<Build, Build> {
    public handle(event: Match<Build, Build>): EventPlan {
        const root = event.root;
        const message = new DirectedMessage(`${root.nodeName()} event received`, new ChannelAddress("#general"));
        return EventPlan.ofMessage(message);
    }
}

export const failedBuild = new FailedBuild();
