import { EventHandler, Tags } from "@atomist/rug/operations/Decorators";
import { HandleEvent, LifecycleMessage, Plan } from "@atomist/rug/operations/Handlers";
import { GraphNode, Match, PathExpression } from "@atomist/rug/tree/PathExpression";

import { Comment } from "@atomist/cortex/Comment";
import { Issue } from "@atomist/cortex/Issue";


const inProcessLabelName = "in-process"

@EventHandler("PersonalIssues", "Handle created issue events",
    new PathExpression<Issue, Issue>(
        `/Issue()
            [/resolvingCommits::Commit()/author::GitHubId()
                [/person::Person()/chatId::ChatId()]?]?
            [/openedBy::GitHubId()[/person::Person()/chatId::ChatId()]?]
            [/labels::Label()]?
            [/repo::Repo()/channels::ChatChannel()]
            [/assignees::GitHubId()/person::Person()/chatId::ChatId()]?`))
@Tags("github", "issue")
class PersonalIssues implements HandleEvent<Issue, Issue> {
    handle(event: Match<Issue, Issue>): Plan {

        const issue = event.root();

        let myGithubUser = "jessitron"
        let myPersonalIssuesChannel = "jessitron-status"

        let isInProcess = issue.labels.filter(label => label.name === "in-process").length > 0;

        let me = issue.assignees.filter(gh => gh.login == myGithubUser)
        if (me.length === 0) {
            // do nothing
            return new Plan();
        }

        const cid = myGithubUser + "-issue/" + issue.repo.owner + "/" + issue.repo.name + "/" + issue.number;
        const message = new LifecycleMessage(issue, cid);

        // TODO
        // message.addAction({
        //     label: "Unassign",
        //     instruction: {
        //         kind: "command",
        //         name: "AssignGitHubIssue",
        //         parameters: {
        //             issue: issue.number,
        //             owner: issue.repo.owner,
        //             repo: issue.repo.name,
        //             person: me
        //         },
        //     },
        // });

      if (isInProcess) {
        message.addAction({
            label: "Start",
            instruction: {
                kind: "command",
                name: "AddLabelGitHubIssue",
                parameters: {
                    issue: issue.number,
                    owner: issue.repo.owner,
                    repo: issue.repo.name,
                    label: inProcessLabelName
                },
            },
        });
      } else {
          // not in process
          message.addAction({
            label: "Stop",
            instruction: {
                kind: "command",
                name: "RemoveLabelGitHubIssue",
                parameters: {
                    issue: issue.number,
                    owner: issue.repo.owner,
                    repo: issue.repo.name,
                    label: inProcessLabelName
                },
            },
        });
      }

// TODO: Done! which closes the issue and removes InProcess. 
        // message.addAction({
        //     label: "Close",
        //     instruction: {
        //         kind: "command",
        //         name: "CloseGitHubIssue",
        //         parameters: {
        //             issue: issue.number,
        //             owner: issue.repo.owner,
        //             repo: issue.repo.name,
        //         },
        //     },
        // });

        return Plan.ofMessage(message);
    }
}
export const openedIssue = new PersonalIssues();