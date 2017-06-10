import { CommandHandler, EventHandler, Intent, MappedParameter, Parameter, ParseJson, ResponseHandler, Secrets, Tags } from "@atomist/rug/operations/Decorators";
import { CommandPlan, HandleCommand, HandlerContext, HandleResponse, MappedParameters, MessageMimeTypes, Response, ResponseMessage } from "@atomist/rug/operations/Handlers";
import { Pattern } from "@atomist/rug/operations/RugOperation";
import * as CommonHandlers from "@atomist/rugs/operations/CommonHandlers";
import * as PlanUtils from "@atomist/rugs/operations/PlanUtils";
import { camelCase } from "camelcase/CamelCase";
import * as Random from "random-js";
import { toEmoji } from "./SlackEmoji";

function randomHexColor(id: number): string {

    const mt = new Random.engines.mt19937();
    mt.seed(id);
    const n = Math.abs(mt());
    let h = "#" + Math.floor(n % 16777215).toString(16).substr(0, 6);
    while (h.length < 6) {
        h = "0" + h; // cheap leftpad
    }
    return h;
}

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
        required: false,
    })
    orgRepo: string = "";

    @Parameter({
        pattern: Pattern.any,
        description: "must mention this user (or blank)",
        required: false,
    })
    mentions: string = "";

    @Parameter({
        pattern: Pattern.any,
        description: "must be assigned to this github user (or blank)",
        required: false,
    })
    assignee: string = "";

    @Parameter({
        pattern: Pattern.any,
        description: "status: open, closed, merged",
        required: false,
    })
    status: string = "open";

    // TODO: accept user; use path expression to get GitHub login.

    handle(command: HandlerContext): CommandPlan {
        const plan = new CommandPlan();

        const me = "jessitron";
        const org = "satellite-of-love";
        let mentions = this.mentions;
        if (mentions === "me") {
            mentions = me;
        }
        let mentionQuery = "";
        if (mentions !== "") {
            mentionQuery = `mentions:${mentions}`;
        }

        let assignee = this.assignee;
        if (assignee === "me") {
            assignee = me;
        }

        let assigneeQuery = "";
        if (assignee !== "") {
            assigneeQuery = `assignee:${assignee}`;
        }

        let repoQuery = "";
        if (this.orgRepo !== "") {
            // todo: validate. todo: default the org.
            repoQuery = `repo:${this.orgRepo}`;
        }
        const statusQuery = `is:${this.status}`;

        const base = `https://api.github.com/search/issues`;

        const queries = [mentionQuery, assigneeQuery, statusQuery, repoQuery].filter((s) => s !== "");
        if (queries === [statusQuery]) {
            return CommandPlan.ofMessage(new ResponseMessage(
                `I don't want to query all ${this.status} issues on GitHub. Try adding \`--assignee me\` or \`--orgRepo satellite-of-love/workflow-rugs\``,
            ));
        }

        const instr = PlanUtils.execute("http",
            {
                url: `${base}?q=${queries.join("%20")}`,
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
            name: "ReceiveSearchIssues",
            parameters: { queryString: queries.join("+") },
        };

        CommonHandlers.handleErrors(instr, { msg: "The request to GitHub failed" });
        plan.add(new ResponseMessage(`Querying github for issues ${queries.join(" ")}`));
        plan.add(instr);

        return plan;

    }

}

@ResponseHandler("ReceiveSearchIssues", "step 2 in ListMyIssues")
class ReceiveSearchIssues implements HandleResponse<any> {
    @Parameter({ pattern: Pattern.any })
    queryString: string;

    handle(response: Response<any>): CommandPlan {

        const result = JSON.parse(response.body);

        const count = result.total_count;

        const information = result.items.map((item) => {
            const type = this.issueOrPR(item);
            const repo = this.issueRepo(item);
            const labels = item.labels.map((label) => toEmoji(label.name)).join(" ");
            let assignee = "Unassigned";
            if (item.assignees.size > 0) {
                assignee = "assigned to " + item.assignees.map((a) => toEmoji(a.login)).join(" ");
            } else if (item.assignee != null) {
                assignee = "assigned to " + toEmoji(item.assignee.login);
            }

            const slack: any = {
                mrkdwn_in: ["text"],
                color: randomHexColor(item.id),
                author_name: assignee,
                title: `<${item.html_url}|${repo} ${type} #${item.number}: ${item.title}>`,
                text: `${labels} created ${this.timeSince(item.created_at)} by :${item.user.login}:, updated ${this.timeSince(item.updated_at)}`,
                fallback: item.html_url,
            };
            if (this.not_long_ago(item.created_at)) {
                slack.thumb_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Sol.svg/256px-Sol.svg.png";
            }
            return slack;
        });

        const slack = {
            text: `There are ${count}. Search more on <https://github.com/issues?q=${this.queryString}|Github>`,
            attachments: information,
        };

        const plan = CommandPlan.ofMessage(new ResponseMessage(JSON.stringify(slack), MessageMimeTypes.SLACK_JSON));

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
        if (match == null) { return item.url; }
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
        }
        else {
            return dateString.substr(0, 10);
        }
    }
}

export const received = new ReceiveSearchIssues();
export const searchIssues = new SearchIssues();
