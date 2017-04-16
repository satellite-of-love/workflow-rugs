import { HandleCommand, MappedParameters, MessageMimeTypes, Response, HandleResponse, HandlerContext, ResponseMessage, Respondable, Plan } from '@atomist/rug/operations/Handlers';
import { EventHandler, ResponseHandler, ParseJson, CommandHandler, Secrets, MappedParameter, Parameter, Tags, Intent } from '@atomist/rug/operations/Decorators'
import { Pattern } from '@atomist/rug/operations/RugOperation';
import * as PlanUtils from '@atomist/rugs/operations/PlanUtils';

/**
 * A sample Rug TypeScript command handler.
 */
@CommandHandler("ListMyIssues", "Make it possible to add this new label to an issue in this repo")
@Tags("labels", "github")
@Intent("list my issues")
@Secrets("github://user_token?scopes=repo")
class ListMyIssues implements HandleCommand {

    handle(command: HandlerContext): Plan {
        let plan = new Plan();

        const base = `https://api.github.com/search/issues`;

        plan.add(
            {
                instruction: {
                    kind: "execute",
                    name: "http",
                    parameters: {
                        url: `${base}?q=assignee:jessitron%20org:satellite-of-love`,
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

        let information = result.items.map(item => {
            let type = this.issueOrPR(item);
            let repo = this.issueRepo(item);
            let labels = item.labels.map(label => `:${label.name}:`).join(" ");

            return {
                "mrkdwn_in": ["text"],
                "title": `<${item.url}|${repo} ${type} #${item.number}: ${item.title}>`,
                "text": `${labels} created ${this.timeSince(item.created_at)}, updated ${this.timeSince(item.updated_at)}, closed ${this.timeSince(item.closed_at)}`,
                "fallback": item.url
            };
        });

        let slack = {
            text: `You have ${count} things going`,
            attachments: information
        };

        let plan = Plan.ofMessage(new ResponseMessage(JSON.stringify(slack), MessageMimeTypes.SLACK_JSON));

        return plan;
    }

    private issueRepo(item) {
        let match = /repos\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+)\//.exec(item.url);
        if (match == null) { return item.url }
        return match[1];
    }

    private issueOrPR(item) {
        if (item.url.indexOf("/issues/") > 0) {
            return "issue";
        }
        return "pr";
    }

    private timeSince(dateString : string) {
        if (dateString == null) {
            return "never";
        }
        let then = Date.parse(dateString)
        let now = new Date().getTime();
        let secondsPast = (now - then) / 1000;
        if (secondsPast < 60) {
            return `${secondsPast}s ago`;
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
            return dateString;
        }
    }
}

export const received = new ReceiveMyIssues();
export const listMyIssues = new ListMyIssues();
