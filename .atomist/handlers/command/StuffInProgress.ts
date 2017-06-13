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
    ResponseMessage, MappedParameters
} from "@atomist/rug/operations/Handlers";
import * as CommonHandlers from "@atomist/rugs/operations/CommonHandlers";
import * as PlanUtils from "@atomist/rugs/operations/PlanUtils";
import * as SlackMessages from "@atomist/slack-messages/SlackMessages";
import {toEmoji} from "./SlackEmoji";
import {Pattern} from "@atomist/rug/operations/RugOperation";

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
        const plan = new CommandPlan();

        const user = "jessitron";
        const org = "satellite-of-love";

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
            name: "ReceiveMyIssues",
            parameters: {
                corrid: this.corrid,
                channel: this.channel
            }
        };
        CommonHandlers.handleErrors(instr, {msg: "The request to GitHub failed"});
        plan.add(instr);

        return plan;
    }

}

@ResponseHandler("ReceiveMyIssues", "step 2 in ListMyIssues")
class ReceiveMyIssues implements HandleResponse<any> {
    @Parameter({pattern: Pattern.any})
    public corrid: string;

    @Parameter({pattern: Pattern.any})
    public channel: string = "general";

    public handle(response: Response<any>): CommandPlan {

        const result = JSON.parse(response.body);


        const count = result.total_count;

        // TODO: in the search string, ignore ones closed a long time ago so we don't get to many.
        const closedOnes = result.items.filter((item) => this.not_long_ago(item.closed_at));
        const openOnes = result.items.filter((item) => !item.closed_at);

        const closeInstructions = openOnes.map((item) =>
            closeInstruction(this.channel, this.corrid, item)
        )

        const information = openOnes.map((item, i) => {
            const type = this.issueOrPR(item);
            const repo = this.issueRepo(item);
            const labels = item.labels.map((label) => toEmoji(label.name)).join(" ");

            const attachment: any = {
                mrkdwn_in: ["text"],
                color: "#3D9900",
                title: `<${item.html_url}|${repo} ${type} #${item.number}: ${item.title}>`,
                text: `${labels} created ${this.timeSince(item.created_at)}, updated ${this.timeSince(item.updated_at)}`,
                fallback: item.html_url,
                actions: [
                    SlackMessages.rugButtonFrom({text: "Close issue"},
                        closeInstructions[i]),
                ],
            };
            if (this.not_long_ago(item.created_at)) {
                attachment.thumb_url =
                    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Sol.svg/256px-Sol.svg.png";
            }
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
                thumb_url: "https://upload.wikimedia.org/wikipedia/commons/9/91/Checked_icon.png",
            };
        });

        const slack = SlackMessages.render({
            text: `You have ${information.length} things going`,
            attachments: closedInformation.concat(information),
        }, true);

        let msg = new ResponseMessage(slack,
            MessageMimeTypes.SLACK_JSON)
        closeInstructions.forEach((item) =>
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

function closeInstruction(channel: string, corrid: string, item): SlackMessages.IdentifiableInstruction & Identifiable<any> {

    const [repo, owner] = parseRepositoryUrl(item.repository_url);
    const instr: Identifiable<"command"> & any /* and Respondable */ = {
        instruction: {
            kind: "command", name: {
                name: "CloseGitHubIssue",
                group: "atomist",
                artifact: "github-rugs",
            },
            parameters: {
                corrid,
                issue: item.number,
                repo,
                owner,
            }
        },
        onSuccess: new DirectedMessage("Closed <${item.html_url}|${owner}/${repo}#${item.number}"
            , new ChannelAddress(channel)),
    };
    const identifier: SlackMessages.IdentifiableInstruction = {
        id: `CLOSE-${item.html_url}`
    };
    return {
        ...instr,
        ...identifier
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
