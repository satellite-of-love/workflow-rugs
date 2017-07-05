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
    const url = `https://api.travis-ci.org/builds/${build.id}`;
    return {
        instruction: {
            kind: "execute",
            name: "http",
            parameters: {
                url,
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
            kind: "respond", name: LessGenericErrorHandler.handlerName,
            parameters: { channel: "banana", msg: url },
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
            result.jobs ?
                (result.jobs.length > 0 ?
                    (result.jobs[0].id ?
                        result.jobs[0].id : "sorry: no ID")
                    : "sorry: No entries in jobs")
                : (result.matrix ?
                    (result.matrix.length > 0 ?
                        (result.matrix[0].id ?
                            result.matrix[0].id : "sorry: no matrix ID")
                        : "sorry: No entries in matrix")
                    : "sorry: no jobs and no matrix");
        console.log("the BuildDetails result is: " + JSON.stringify(result));

        if (jobId.startsWith("sorry")) {
            return EventPlan.ofMessage(
                new DirectedMessage(
                    `Sorry, couldn't find the job inside the build for ${result.id} on ${this.repo}.`,
                    new ChannelAddress("banana")));
        }
        const plan = new EventPlan();
        plan.add(new DirectedMessage(`Found a job id ${jobId} in repo ${this.repo}`, new ChannelAddress("general")));
        plan.add(retrieveLogInstruction(this.repo, jobId));
        return plan;

    }
}

function retrieveLogInstruction(repo: string, jobId: string) {
    const url = `https://api.travis-ci.org/jobs/${jobId}`;
    return {
        instruction: {
            kind: "execute",
            name: "http",
            parameters: {
                url,
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
            parameters: { channel: "banana", msg: url },
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

@ResponseHandler(LessGenericErrorHandler.handlerName, "Displays an error in chat")
@Tags("errors")
export class LessGenericErrorHandler implements HandleResponse<any> {

    public static handlerName = "LessGenericErrorHandler";

    @Parameter({ description: "Error prefix", pattern: "@any", required: false })
    public msg: string;

    @Parameter({ description: "Channel to report in", pattern: "@any", required: false })
    public channel: string;

    public handle(response: Response<any>): EventPlan {
        console.log("Less-generic error handler, activate! " + this.channel + " " + this.msg);
        const body = response.body != null ? "(" + response.body + ")" : "";
        const msg = this.msg === undefined ? "" : this.msg;

        const contents = `${msg} ${response.msg} ${body}`;

        return new EventPlan().add(new DirectedMessage(contents, new ChannelAddress(this.channel)));
    }
}

export const receiveLog = new ReceiveLog();
export const lessGenericErrorHandler = new LessGenericErrorHandler();
export const thinger = new ReceiveBuildDetails();

export const failedBuild = new FailedBuild();
