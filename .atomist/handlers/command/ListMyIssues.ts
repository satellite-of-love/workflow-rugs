import { HandleCommand, MappedParameters, MessageMimeTypes, Response, HandleResponse, HandlerContext, ResponseMessage, Respondable, Plan } from '@atomist/rug/operations/Handlers';
import { EventHandler, ResponseHandler, ParseJson, CommandHandler, Secrets, MappedParameter, Parameter, Tags, Intent } from '@atomist/rug/operations/Decorators'
import { Pattern } from '@atomist/rug/operations/RugOperation';
import * as PlanUtils from '@atomist/rugs/operations/PlanUtils';
import { ChatTeam } from '@atomist/cortex/ChatTeam';
import { GitHubId } from '@atomist/cortex/GitHubId';

/**
 * A sample Rug TypeScript command handler.
 */
@CommandHandler("ListMyIssues", "Make it possible to add this new label to an issue in this repo")
@Tags("satellite-of-love", "github")
@Intent("list my issues")
@Secrets("github://user_token?scopes=repo")
class ListMyIssues implements HandleCommand {

    @MappedParameter(MappedParameters.SLACK_USER)
    user: string;

    handle(command: HandlerContext): Plan {
        let plan = new Plan();

        let pxe = command.pathExpressionEngine;

        let match = pxe.scalar<ChatTeam, GitHubId>(command.contextRoot as ChatTeam,
            `/members::ChatId()[@id='${this.user}']/person::Person()/gitHubId::GitHubId()`);

        let user = "jessitron";
        if (match && match.login) {
            console.log(match.login);
            user = match.login;
        }
        let org = "satellite-of-love";

        const base = `https://api.github.com/search/issues`;

        plan.add(
            {
                instruction: {
                    kind: "execute",
                    name: "http",
                    parameters: {
                        url: `${base}?q=assignee:${user}%20org:${org}`,
                        method: "get",
                        config: {
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `token #{github://user_token?scopes=repo}`,
                            },
                        }
                    }
                }
                , onSuccess: { kind: "respond", name: "ReceiveMyIssues", parameters: {} }
            }
        );
        return plan;
    }

}

@ResponseHandler("ReceiveMyIssues", "step 2 in ListMyIssues")
class ReceiveMyIssues implements HandleResponse<any> {
    handle(response: Response<any>, ): Plan {

        let result = JSON.parse(response.body)


        let count = result.total_count;

        //TODO: in the search string, ignore ones closed a long time ago so we don't get to many.
        let closedOnes = result.items.filter(item => this.not_long_ago(item.closed_at));
        let openOnes = result.items.filter(item => !item.closed_at);

        let information = openOnes.map(item => {
            let type = this.issueOrPR(item);
            let repo = this.issueRepo(item);
            let labels = item.labels.map(label => `:${label.name.replace(":", "-")}:`).join(" ");

            return {
                "mrkdwn_in": ["text"],
                "color": "#3D9900",
                "title": `<${item.html_url}|${repo} ${type} #${item.number}: ${item.title}>`,
                "text": `${labels} created ${this.timeSince(item.created_at)}, updated ${this.timeSince(item.updated_at)}`,
                "fallback": item.html_url
            };
        });

        let closedInformation = closedOnes.map(item => {
            let type = this.issueOrPR(item);
            let repo = this.issueRepo(item);
            let labels = item.labels.map(label => `:${label.name.replace(":", "-")}:`).join(" ");

            return {
                "mrkdwn_in": ["text"],
                "color": "#0066FF",
                "title": `<${item.html_url}|${repo} ${type} #${item.number}: ${item.title}>`,
                "text": `${labels} created ${this.timeSince(item.created_at)}, closed ${this.timeSince(item.closed_at)}`,
                "fallback": item.html_url
            };
        });

        let slack = {
            text: `You have ${information.length} things going`,
            attachments: closedInformation.concat(information)
        };

        let plan = Plan.ofMessage(new ResponseMessage(JSON.stringify(slack), MessageMimeTypes.SLACK_JSON));

        return plan;
    }

    private not_long_ago(dateString) {
        if (dateString == null) {
            return false;
        }
        let recent = 86400; // a day
        if (new Date().getDay() == 1) {
            // it is Monday
            recent = recent * 3; // think back to Friday
        }
        let then = Date.parse(dateString)
        let now = new Date().getTime();
        let secondsPast = (now - then) / 1000;

        return secondsPast < recent;
    }

    private issueRepo(item) {
        let match = /repos\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+)\//.exec(item.url);
        if (match == null) { return item.url }
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
        let then = Date.parse(dateString)
        let now = new Date().getTime();
        let secondsPast = (now - then) / 1000;
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
        }
        else {
            return dateString.substr(0, 10);
        }
    }
}

export const received = new ReceiveMyIssues();
export const listMyIssues = new ListMyIssues();
