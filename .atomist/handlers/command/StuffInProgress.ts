import {
    CommandHandler, Intent, ResponseHandler,
    MappedParameter, Secrets, Tags, Parameter
} from "@atomist/rug/operations/Decorators";
import {
    ChannelAddress,
    CommandPlan,
    DirectedMessage,
    HandleCommand,
    HandlerContext,
    HandleResponse,
    Identifiable,
    MessageMimeTypes,
    Response,
    UpdatableMessage, MappedParameters
} from "@atomist/rug/operations/Handlers";
import * as CommonHandlers from "@atomist/rugs/operations/CommonHandlers";
import * as PlanUtils from "@atomist/rugs/operations/PlanUtils";
import * as SlackMessages from "@atomist/slack-messages/SlackMessages";
import {toEmoji} from "./SlackEmoji";
import {Pattern} from "@atomist/rug/operations/RugOperation";
import {LessGenericErrorHandler} from "../event/FailedBuild";

/**
 * A sample Rug TypeScript command handler.
 */
@CommandHandler("StuffInProgress", "Show my in-progress issues and branches, the way I want to see them")
@Tags("satellite-of-love", "github")
@Intent("que pasa")
@Secrets("github://user_token?scopes=repo")
class StuffInProgress implements HandleCommand {

    // TODO: accept user; use path expression to get GitHub login.

    @MappedParameter("atomist://correlation_id")
    public corrid: string;


    @MappedParameter(MappedParameters.SLACK_CHANNEL)
    public channel: string;


    public handle(command: HandlerContext): CommandPlan {
        const channel = "general" ;// TODO get the real channel. this.channel;
        const issuesMessageId = `issues-for-${this.corrid}`;
        const user = "jessitron";
        const org = "satellite-of-love";

        const instr = queryIssuesInstruction(user, channel, org, issuesMessageId);

        const plan = new CommandPlan();
        plan.add(instr);
        return plan;
    }

}

function queryIssuesInstruction(user: string, channel: string, org: string, messageId: string) {

    const base = `https://api.github.com/search/issues`;

    const instr = PlanUtils.execute("http",
        {
            url: `${base}?q=assignee:${user}%20org:${org}`,
            method: "get",
            config: {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `token #{github://user_token?scopes=repo}`,
                },
            },
        },
    );
    instr.onSuccess = {
        kind: "respond",
        name: ReceiveMyIssues.handlerName,
        parameters: {
            gitHubUser: user,
            messageId,
            channel
        }
    };
    CommonHandlers.handleErrors(instr, {msg: "The request to GitHub failed"});
    return instr;
}

function closeIssueInstruction(channel: string, owner: string, repo: string, issueNumber: string) {

    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;

    const instr = PlanUtils.execute("http",
        {
            url,
            method: "patch",
            config: {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `token #{github://user_token?scopes=repo}`,
                },
                body: JSON.stringify({
                    state: "closed"
                })
            },
        },
    );
    instr.onError = {
        kind: "respond",
        name: LessGenericErrorHandler.handlerName,
        parameters: {
            msg: "Failure accessing " + url,
            channel
        }
    };
    return instr;
}

function removeLabelInstruction(channel: string, owner: string, repo: string, issueNumber: string, labelName: string) {

    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels/${labelName}`;

    const instr = PlanUtils.execute("http",
        {
            url,
            method: "delete",
            config: {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `token #{github://user_token?scopes=repo}`,
                },
                body: JSON.stringify({
                    state: "closed"
                })
            },
        },
    );
    instr.onError = {
        kind: "respond",
        name: LessGenericErrorHandler.handlerName,
        parameters: {
            msg: "Failure accessing " + url,
            channel
        }
    };
    return instr;
}

@ResponseHandler(ReceiveMyIssues.handlerName, "step 2 in StuffInProgress")
class ReceiveMyIssues implements HandleResponse<any> {

    static handlerName = "ReceiveMyIssues";

    @Parameter({pattern: Pattern.any})
    public gitHubUser: string;

    @Parameter({pattern: Pattern.any})
    public messageId: string;

    @Parameter({pattern: Pattern.any})
    public channel: string;

    public handle(response: Response<any>): CommandPlan {

        const result = JSON.parse(response.body);

        // TODO: in the search string, ignore ones closed a long time ago so we don't get to many.
        const closedOnes = result.items.filter((item) => this.not_long_ago(item.closed_at));
        const openOnes = result.items.filter((item) => !item.closed_at);


        const completeIssueInstructions = openOnes.map((item) => {
                const [repo, owner] = parseRepositoryUrl(item.repository_url);
                return markIssueCompleteInstruction(
                    this.channel,
                    this.messageId,
                    this.gitHubUser,
                    owner, repo, item.number)
            }
        );

        function hasLabel(item, labelName: string): boolean {
           return item.labels.filter(l => l.name === labelName).length > 0
        }

        const information = openOnes.map((item, i) => {
            const type = this.issueOrPR(item);
            const repo = this.issueRepo(item);
            const labels = item.labels.map((label) => toEmoji(label.name)).join(" ");
            const closeButtonLabel = hasLabel(item, "in-progress") ? "Complete!" : "Close";

            const attachment: any = {
                mrkdwn_in: ["text"],
                color: "#3D9900",
                title: `<${item.html_url}|${repo} ${type} #${item.number}: ${item.title}>`,
                text: `${labels} created ${this.timeSince(item.created_at)}, updated ${this.timeSince(item.updated_at)}`,
                fallback: item.html_url,
                actions: [
                    SlackMessages.rugButtonFrom({text: closeButtonLabel},
                        completeIssueInstructions[i]),
                ],
            };
            return attachment;
        });

        // one message with all the recently closed ones
        const closedInformation = closedOnes.map((item) => {
            const type = this.issueOrPR(item);
            const repo = this.issueRepo(item);
            const labels = item.labels.map((label) => `:${label.name.replace(":", "-")}:`).join(" ");

            return {
                mrkdwn_in: ["text"],
                color: "#0066FF",
                title: `<${item.html_url}|${repo} ${type} #${item.number}: ${item.title}>`,
                text: `${labels} created ${this.timeSince(item.created_at)}, closed ${this.timeSince(item.closed_at)}`,
                fallback: item.html_url,
            };
        });

        const slack = SlackMessages.render({
            text: `You have ${information.length} things going`,
            attachments: closedInformation.concat(information),
        }, true);

        let msg = new UpdatableMessage(this.messageId, slack, new ChannelAddress(this.channel),
            MessageMimeTypes.SLACK_JSON);
        completeIssueInstructions.forEach((item) =>
            msg.addAction(item)
        );

        console.log("THE MESSAGE SAYS: " + JSON.stringify(msg))

        const plan = CommandPlan.ofMessage(msg);

        return plan;
    }

    private not_long_ago(dateString) {
        if (dateString == null) {
            return false;
        }
        let recent = 86400; // a day
        if (new Date().getDay() === 1) {
            // it is Monday
            recent = recent * 3; // think back to Friday
        }
        const then = Date.parse(dateString);
        const now = new Date().getTime();
        const secondsPast = (now - then) / 1000;

        return secondsPast < recent;
    }

    private issueRepo(item) {
        const match = /repos\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+)\//.exec(item.url);
        if (match == null) {
            return item.url;
        }
        return match[1];
    }

    private issueOrPR(item) {
        if (item.html_url.indexOf("/issues/") > 0) {
            return "issue";
        }
        return "pr";
    }

    private timeSince(dateString: string) {
        if (dateString == null) {
            return "never";
        }
        const then = Date.parse(dateString);
        const now = new Date().getTime();
        const secondsPast = (now - then) / 1000;
        if (secondsPast < 60) {
            return `${Math.round(secondsPast)}s ago`;
        }
        if (secondsPast < 3600) {
            return `${Math.round(secondsPast / 60)}m ago`;
        }
        if (secondsPast <= 86400) {
            return `${Math.round(secondsPast / 3600)}h ago`;
        }
        if (secondsPast <= (86400 * 30)) {
            return `${Math.round(secondsPast / 86400)}d ago`;
        } else {
            return dateString.substr(0, 10);
        }
    }
}

function parseRepositoryUrl(repositoryUrl: string): [string, string] {
    const match = repositoryUrl.match(/^https:\/\/api\.github\.com\/repos\/([-.\w]+)\/([-.\w]+)$/);
    return [match[2], match[1]];
}

function markIssueCompleteInstruction(channel: string,
                                      messageId: string,
                                      gitHubUser: string,
                                      owner: string,
                                      repo: string,
                                      issueNumber: string):
    SlackMessages.IdentifiableInstruction & Identifiable<any> {

    const instr: Identifiable<"command"> & any /* NOT Respondable */ = {
        instruction: {
            kind: "command", name: MarkIssueComplete.handlerName,
            parameters: {
                channel,
                messageId,
                issueNumber,
                repo,
                owner,
                gitHubUser,
            }
        },
    };
    const identifier: SlackMessages.IdentifiableInstruction = {
        id: `MARK-COMPLETE-${owner}-${repo}-${issueNumber}`
    };
    return {
        ...instr,
        ...identifier
    }
}

@CommandHandler(MarkIssueComplete.handlerName, "Stop progress and close an issue")
@Tags("satellite-of-love", "github")
@Intent("yo I am done")
@Secrets("github://user_token?scopes=repo")
class MarkIssueComplete implements HandleCommand {

    static handlerName = "MarkIssueComplete";

    // I want to be able to invoke this from the commandline (uncommonly)
    // and also from a button in a message that will subsequently be updated.
    @Parameter({pattern: Pattern.any})
    public messageId: string = `not set`;

    @MappedParameter(MappedParameters.SLACK_CHANNEL)
    public channel: string = "general";

    @MappedParameter(MappedParameters.GITHUB_REPOSITORY)
    public repo: string = "general";

    @MappedParameter(MappedParameters.GITHUB_OWNER)
    public owner: string = "general";

    @Parameter({pattern: Pattern.any})
    public issueNumber: string;

    @Parameter({pattern: Pattern.any})
    public gitHubUser: string = "`not-set`";

    handle(ctx: HandlerContext): CommandPlan {

        const closeIssue: any = closeIssueInstruction(this.channel,
            this.owner, this.repo, this.issueNumber);
        const onSuccessPlan = new CommandPlan();
        onSuccessPlan.add(
            this.send(`Closed issue ${this.owner}/${this.repo}#${this.issueNumber}`));
        if (this.messageId !== "`not set`") {
            onSuccessPlan.add(this.debug(`Refreshing original message ${this.messageId}`));
            onSuccessPlan.add(queryIssuesInstruction(this.gitHubUser, this.channel, this.owner, this.messageId));
        }
        closeIssue.onSuccess = onSuccessPlan;

        const removeInProgressLabel = removeLabelInstruction(this.channel, this.owner, this.repo, this.issueNumber, "in-progress");

        const plan = new CommandPlan();
        plan.add(this.send(`Removing in-progress label`));
        plan.add(removeInProgressLabel);
        plan.add(this.send(`Closing issue ${this.owner}/${this.repo}#${this.issueNumber}...`));
        plan.add(closeIssue);
        return plan;
    }

    private send(msg: string) {
        return new DirectedMessage(msg, new ChannelAddress(this.channel))
    }

    private debug(msg: string) {
        return new DirectedMessage(msg, new ChannelAddress("banana"))
    }

}


@CommandHandler("Dammit", "Do something please")
@Intent("do something")
class Dammit implements HandleCommand {

    public handle(command: HandlerContext): CommandPlan {
        return CommandPlan.ofMessage(new DirectedMessage("THIS IS SOMETHING",
            new ChannelAddress("general"), "text/plain"))
    }
}

export const dammit = new Dammit();
export const received = new ReceiveMyIssues();
export const stuffInProgress = new StuffInProgress();
export const mm = new MarkIssueComplete();
