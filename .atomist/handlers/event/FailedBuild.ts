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
            kind: "respond", name: "LessGenericErrorHandler",
            parameters: { channel: "banana" },
        } as Respond,
        onSuccess: {
            kind: "respond", name: "ReceiveBuildDetails",
            parameters: { repo: build.repo.name },
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
        plan.add(retrieveLogInstruction(this.repo, jobId));
        return plan;

    }
}

function retrieveLogInstruction(repo: string, jobId: string) {
    return {
        instruction: {
            kind: "execute",
            name: "http",
            parameters: {
                url: `https://api.travis-ci.org/jobs/${jobId}`,
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
            kind: "respond", name: "LessGenericErrorHandler",
            parameters: { channel: "banana", msg: "trying to retrieve job details with the log in it" },
        } as Respond,
        onSuccess: {
            kind: "respond", name: "ReceiveLog",
            parameters: { repo },
        } as Respond,

    };
}

@ResponseHandler("ReceiveLog", "step 3 in FailedBuild")
class ReceiveLog implements HandleResponse<any> {

    @Parameter({ pattern: Pattern.any })
    public repo: string;

    public handle(response: Response<any>): EventPlan {
        const result = JSON.parse(response.body);

        const log = result.log;
        if (!log) {
            return EventPlan.ofMessage(
                new DirectedMessage("Did not find the log for job " + result.id,
                    new ChannelAddress(this.repo)));
        }

        const plan = new EventPlan();
        plan.add(new DirectedMessage(
            `Found a log for ${result.id}`, new ChannelAddress(this.repo)));
        return plan;

    }
}

@ResponseHandler("LessGenericErrorHandler", "Displays an error in chat")
@Tags("errors")
class LessGenericErrorHandler implements HandleResponse<any> {

    @Parameter({ description: "Error prefix", pattern: "@any", required: false })
    public msg: string;

    @Parameter({ description: "Channel to report in", pattern: "@any", required: false })
    public channel: string;

    public handle(response: Response<any>): EventPlan {
        const body = response.body != null ? "(" + response.body + ")" : "";
        const msg = this.msg === undefined ? "" : this.msg;

        const contents = `${msg}${response.msg}${body}`;

        return new EventPlan().add(new DirectedMessage(contents, new ChannelAddress(this.channel)));
    }
}

export const receiveLog = new ReceiveLog();
export const lessGenericErrorHandler = new LessGenericErrorHandler();
export const thinger = new ReceiveBuildDetails();

export const failedBuild = new FailedBuild();
