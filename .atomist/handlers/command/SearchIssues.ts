import { HandleCommand, MappedParameters, MessageMimeTypes, Response, HandleResponse, HandlerContext, ResponseMessage, Respondable, Plan } from '@atomist/rug/operations/Handlers';
import { EventHandler, ResponseHandler, ParseJson, CommandHandler, Secrets, MappedParameter, Parameter, Tags, Intent } from '@atomist/rug/operations/Decorators'
import { Pattern } from '@atomist/rug/operations/RugOperation';
import * as PlanUtils from '@atomist/rugs/operations/PlanUtils';
import * as CommonHandlers from '@atomist/rugs/operations/CommonHandlers';

/**
 * A sample Rug TypeScript command handler.
 */
@CommandHandler("SearchIssues", "Personal issue search, cross-org")
@Tags("satellite-of-love", "github")
@Intent("search issues")
@Secrets("github://user_token?scopes=repo")
class SearchIssues implements HandleCommand {

    @Parameter({
        pattern: Pattern.any,
        displayName: "repo",
        description: "org/repo, or blank for all",
        required: false
    })
    orgRepo: string = "";

    @Parameter({
        pattern: Pattern.any,
        description: "issues that mention this user",
        required: false
    })
    mentions: string = "me";

    @Parameter({
        pattern: Pattern.any,
        description: "status: open, closed, merged",
        required: false
    })
    status: string = "open";

    // TODO: accept user; use path expression to get GitHub login.

    handle(command: HandlerContext): Plan {
        let plan = new Plan();

        let me = "jessitron"
        let org = "satellite-of-love"
        let mentions = this.mentions;
        if (mentions === "me") {
            mentions = me;
        }
        let repoQuery = "";
        if (this.orgRepo !== "") {
            // todo: validate. todo: default the org.
            repoQuery = `repo:${this.orgRepo}`;
        }
        let statusQuery = `is:${this.status}`;

        const base = `https://api.github.com/search/issues`;

        let queries = [`mentions:${mentions}`, statusQuery, repoQuery];

        let instr: Respondable<any> = {
            instruction: {
                kind: "execute",
                name: "http",
                parameters: {
                    url: `${base}?q=${queries.join("%20")}`,
                    method: "get",
                    config: {
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `token #{github://user_token?scopes=repo}`,
                        },
                    }
                }
            }
            ,
            onSuccess: { kind: "respond", name: "ReceiveMyIssues", parameters: { queryString: queries.join("+") } }
        };
        CommonHandlers.handleErrors(instr, { msg: "The request to GitHub failed" });
        plan.add(new ResponseMessage(`Querying github for issues ${queries.join(" ")}`));
        plan.add(instr);

        return plan;
    }

}

@ResponseHandler("ReceiveMyIssues", "step 2 in ListMyIssues")
class ReceiveMyIssues implements HandleResponse<any> {
    @Parameter({ pattern: Pattern.any })
    queryString: string;

    handle(response: Response<any>, ): Plan {

        let result = JSON.parse(response.body)

        let count = result.total_count;

        let information = result.items.map(item => {
            let type = this.issueOrPR(item);
            let repo = this.issueRepo(item);
            let labels = item.labels.map(label => `:${label.name.replace(":", "-")}:`).join(" ");
            let assignee = "Unassigned";
            if (item.assignees.size > 0) {
                assignee = "assigned to " + item.assignees.map(a => `:${a.login.toLowerCase}:`).join(" ");
            }

            let slack: any = {
                "mrkdwn_in": ["text"],
                "color": "#3079a4", // this is random. Todo: make it literally random, seeded on issue id. fun :-)
                "author_name": assignee,
                "title": `<${item.html_url}|${repo} ${type} #${item.number}: ${item.title}>`,
                "text": `${labels} created ${this.timeSince(item.created_at)} by :${item.user.login}:, updated ${this.timeSince(item.updated_at)}`,
                "fallback": item.html_url
            };
            if (this.not_long_ago(item.created_at)) {
                slack.thumb_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Sol.svg/256px-Sol.svg.png"
            }
            return slack;
        });


        let slack = {
            text: `There are ${count}. Search more on <https://github.com/issues?q=${this.queryString}|Github>`,
            attachments: information
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
export const searchIssues = new SearchIssues();
