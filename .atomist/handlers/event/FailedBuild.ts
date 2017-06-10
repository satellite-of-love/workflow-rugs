import { EventHandler, Tags } from "@atomist/rug/operations/Decorators";
import { ChannelAddress, DirectedMessage, EventPlan, HandleEvent } from "@atomist/rug/operations/Handlers";
import { Match } from "@atomist/rug/tree/PathExpression";

import { Build, Repo } from "@atomist/cortex/stub/Types";
import { byExample } from "@atomist/rugs/util/tree/QueryByExample";

/**
 * try to get the log.
 */
@EventHandler("FailedBuild", "try to get the log", byExample(new Build().withRepo(new Repo())))
@Tags("travis")
export class FailedBuild implements HandleEvent<Build, Build> {
    public handle(event: Match<Build, Build>): EventPlan {
        const root: Build = event.root;
        const message = new DirectedMessage(
            `${root.nodeName()} event received ${root.id}, ${root.provider}, ${root.status}, ${root.repo.name}`,
            new ChannelAddress("general"));
        return EventPlan.ofMessage(message);
    }
}

function fetchBuildDetailsInstruction(build: Build) {
    return {
        instruction: {
            kind: "execute",
            name: "http",
            parameters: {
                url: `https://api.travis-ci.org/build/${build.id}`,
                method: "get",
                config: {
                    headers: {
                        "Content-Type": "application/vnd.travis-ci.2+json",
                        "User-Agent": "rug/1.0.0",
                    },
                },
            },
        },
    };
}

export const failedBuild = new FailedBuild();