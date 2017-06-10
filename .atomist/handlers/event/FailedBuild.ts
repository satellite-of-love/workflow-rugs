import { EventHandler, Parameter, ResponseHandler, Tags } from "@atomist/rug/operations/Decorators";
import {
    ChannelAddress, DirectedMessage, EventPlan, HandleEvent
    , HandleResponse, Respond, Response,
} from "@atomist/rug/operations/Handlers";
import { Pattern } from "@atomist/rug/operations/RugOperation";
import { Match } from "@atomist/rug/tree/PathExpression";

import { Build, Repo } from "@atomist/cortex/stub/Types";
import * as CommonHandlers from "@atomist/rugs/operations/CommonHandlers";
import { byExample } from "@atomist/rugs/util/tree/QueryByExample";

/**
 * try to get the log.
 */
@EventHandler("FailedBuild", "try to get the log", byExample(
    new Build().withProvider("travis").withStatus("failed").withRepo(new Repo())))
@Tags("travis")
export class FailedBuild implements HandleEvent<Build, Build> {
    public handle(event: Match<Build, Build>): EventPlan {

        const root: Build = event.root;
        const message = new DirectedMessage(
            `${root.nodeName()} event received ${root.id}, ${root.provider}, ${root.status}, ${root.repo.name}`,
            new ChannelAddress("general"));

        const plan = new EventPlan();
        plan.add(message);
        plan.add(fetchBuildDetailsInstruction(root));
        return plan;
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
        onError: {
            kind: "respond", name: "ReceiveBuildDetails",
            parameters: { repo: build.repo.name },
        } as Respond,
        onSuccess: {
            kind: "respond", name: "GenericSuccessHandler",
            parameters: { msg: "yay" },
        } as Respond,

    };
}

@ResponseHandler("ReceiveBuildDetails", "step 2 in FailedBuild")
class ReceiveBuildDetails implements HandleResponse<any> {

    @Parameter({ pattern: Pattern.any })
    public repo: string;

    public handle(response: Response<any>): EventPlan {
        const result = JSON.parse(response.body);

        const jobId =
            result.matrix ?
                (result.matrix.length > 0 ?
                    (result.matrix[0].id ?
                        result.matrix[0].id : "no ID")
                    : "No entries in matrix")
                : "no matrix";

        const plan = new EventPlan();
        plan.add(new DirectedMessage(`Found a job id ${jobId} in repo ${this.repo}`, new ChannelAddress("general")));
        return plan;

    }
}

export const failedBuild = new FailedBuild();
