import React, { type Dispatch, useEffect, useRef, useState, useCallback } from "react"
import { useQuickActionStore } from '../stores/quick-action';
import { usePopupStore } from '../stores/popup';
import { useChatStore } from '../stores/chat';
import { useMessageStateStore } from '../stores/message-state';
import { useConversationStore } from '../stores/conversation';
import type { MessageState } from '~types'
import { MessageItemType, TASK_STATUS, TASK_TYPE, ConversationOperation } from "~types"
import type { QUICK_ACTION, Task } from "~types"
import { buildTask } from "~utils/task"
import { buildIntentMessageList, buildQuestionMessage, buildReplyMessage } from "~utils/message"

import { getPort } from "@plasmohq/messaging/port"
import { buildErrorMessage } from "~utils/message";
import { scrollToBottom } from "~utils/ui";

export const useBuildTask = () => {
    const genResponsePortRef = useRef<chrome.runtime.Port>()

    const quickActionStore = useQuickActionStore();
    const popupStore = usePopupStore();
    const chatStore = useChatStore();
    const messageStateStore = useMessageStateStore();
    const conversationStore = useConversationStore();

    const hasConversation = (id: string) => {
        return conversationStore.conversationList.filter(item => item.conversationId === id)?.length > 0
    }

    const buildGenTitleTaskAndGenResponse = () => {
        // 每次生成会话 title 时，需要重置此字段
        chatStore.setIsGenTitle(false);

        // 生成 chat task
        const taskPayload = {
            taskType: TASK_TYPE.GEN_TITLE,
            data: {
                conversationId: conversationStore.currentConversation?.conversationId
            }
        }
        const task = buildTask(taskPayload)
        // handleGenResponse(task)
    }

    const buildQuickActionTaskAndGenReponse = (
        taskType: TASK_TYPE,
        data: QUICK_ACTION
    ) => {
        const task = buildTask({ taskType, data })

        handleGenResponse(task)
    }

    const buildChatTaskAndGenReponse = (question: string) => {
        const questionMsg = buildQuestionMessage({
            conversationId: conversationStore.currentConversation?.conversationId,
            content: question
        })

        const replyMsg = buildReplyMessage({
            conversationId: conversationStore.currentConversation?.conversationId,
            content: "",
            questionId: questionMsg?.itemId
        })

        // 将 reply 加到 message-state
        messageStateStore.setMessageState({
            pendingReplyMsg: replyMsg
        })

        chatStore.setMessages(chatStore.messages.concat(questionMsg));

        // 将最后一条回答拼到上下文中
        const lastReplyMsg = chatStore.messages
            .filter((message) => message?.itemType === MessageItemType?.REPLY)
            ?.at(-1)
        const taskMsgList = lastReplyMsg
            ? [lastReplyMsg, questionMsg]
            : [questionMsg]

        // 生成 chat task
        const taskPayload = {
            taskType: TASK_TYPE.CHAT,
            data: {
                ...conversationStore.currentConversation,
                items: taskMsgList,
                preGeneratedReplyId: replyMsg?.itemId // 预先生成的回复，用于快速问答 message
            }
        }
        const task = buildTask(taskPayload)
        handleGenResponse(task)
    }

    const buildIntentTaskAndGenReponse = (questionContent: string) => {
        const oldMessages = chatStore.messages;
        const conversationId = conversationStore.currentConversation?.conversationId
        const selectionContent = quickActionStore.selectedText
        const replyContent = ""

        const lastOldReplyMsg = oldMessages
            .filter((item) => item.itemType === MessageItemType.REPLY)
            ?.at(-1)
        const intentMsgList = buildIntentMessageList({
            conversationId,
            selectionContent,
            questionContent,
            replyContent
        })

        const replyMsg = intentMsgList.at(-1)
        // 将 reply 加到 message-state
        messageStateStore.setMessageState({
            pendingReplyMsg: replyMsg
        })

        const newMsgList = oldMessages.concat(intentMsgList.slice(0, -1))
        chatStore.setMessages(newMsgList);
        quickActionStore.setSelectedText("");

        const lastReplyMsgItemId = intentMsgList.at(-1)?.itemId

        // 生成 chat task
        const taskPayload = {
            taskType: TASK_TYPE.CHAT,
            data: {
                ...conversationStore.currentConversation,
                items: [lastOldReplyMsg, ...intentMsgList.slice(0, -1)], // 最后一条回复，加上生成的三条，不算新生成的回复
                preGeneratedReplyId: lastReplyMsgItemId // 预先生成的回复，用于快速问 答 message
            }
        }
        const task = buildTask(taskPayload)
        handleGenResponse(task)
    }
    const buildIntentChatTaskAndGenReponse = () => {
        buildIntentTaskAndGenReponse(chatStore.newQAText)
    }
    const buildIntentQuickActionTaskAndGenReponse = (questionContent: string) => {
        buildIntentTaskAndGenReponse(questionContent)
    }

    const buildShutdownTaskAndGenResponse = () => {
        genResponsePortRef.current.postMessage({
          body: {
            type: TASK_STATUS.SHUTDOWN
          }
        })
      }

    const handleGenResponse = useCallback(
        (task: Task) => {
            // 发起一个 gen 请求，开始接收
            messageStateStore.setMessageState({
                pending: true,
                pendingFirstToken: true,
                taskType: task?.taskType,
                pendingMsg: "",
                error: false
            })

            // 直接发送 task
            genResponsePortRef.current.postMessage({
                body: {
                    type: TASK_STATUS.START,
                    payload: task
                }
            })
        },
        [conversationStore.currentConversation?.conversationId]
    )

    const bindExtensionPorts = () => {
        if (genResponsePortRef.current) return

        genResponsePortRef.current = getPort("gen-response" as never)
        genResponsePortRef.current.onMessage.addListener((msg) => {
            // 新生成一个会话，并且已经有了第一次提问和回答，说明此会话已经保存到数据库，此时可以将会话加入到会话列表里
            if (!chatStore.isGenTitle) {

                !hasConversation(conversationStore.currentConversationId) &&
                    conversationStore.updateConversation(
                        ConversationOperation.CREATE,
                        conversationStore.currentConversation
                    )
            }

            console.log("setMessageState", messageStateStore)

            if (msg?.message === "[DONE]") {
                const newMessageState: Partial<MessageState> = {
                    pending: false,
                    error: false
                }

                // 如果一条消息也没收到就 abort 或者其他形式的 DONE，那么代表响应出错
                if (
                    [TASK_TYPE.CHAT, TASK_TYPE.QUICK_ACTION].includes(
                        messageStateStore?.taskType
                    ) &&
                    messageStateStore.pendingMsg?.length === 0
                ) {
                    if (messageStateStore.taskType === TASK_TYPE.CHAT) {
                        // 构建一条错误消息放在末尾，而不是类似 loading 直接展示，因为要 error 停留在聊天列表里
                        const errMsg = buildErrorMessage({
                            conversationId: conversationStore.currentConversation?.conversationId
                        })

                        chatStore.setMessages([...chatStore.messages, { ...errMsg }])

                        // 更新消息之后滚动到底部
                        setTimeout(() => {
                            scrollToBottom()
                        }, 1000)

                        newMessageState.error = true
                        newMessageState.pendingFirstToken = false
                    } else if (
                        messageStateStore?.taskType === TASK_TYPE.QUICK_ACTION
                    ) {
                        // 针对 quickAction 这类一次性的，就是直接展示错误信息
                        newMessageState.error = true
                        newMessageState.pendingFirstToken = false
                    }

                    // 更新 messageState 的状态，然后直接结束，不走后面的流程
                    messageStateStore.setMessageState(newMessageState)

                    return
                }

                // 更新 messageState 的状态
                messageStateStore.setMessageState(newMessageState)

                // 如果出错，就不会进行 gen-title 的操作
                if (
                    messageStateStore?.taskType === TASK_TYPE.CHAT &&
                    !chatStore.isGenTitle
                ) {
                    // 会话第一次发消息，会再额外多发一个消息用于生产会话 title
                    buildGenTitleTaskAndGenResponse()
                    chatStore.setIsGenTitle(true)
                }

                // 如果此次任务是 gen_title 的任务，那么就去更新对应的会话列表里面的会话 title，默认为 New Conversation/新会话
                // TODO: 可以改成流式，到时候看实际反馈
                if (messageStateStore?.taskType === TASK_TYPE.GEN_TITLE) {
                    // TODO: 先不处理更新 title 等边缘的操作
                    // handleConversationOperation(ConversationOperation.UPDATE, {
                    //   conversationId: nowConversationRef.current?.conversationId,
                    //   title: messageStateRef?.current?.pendingMsg
                    // })
                }

                return
            }

            // 流式更新消息
            messageStateStore.setMessageState({
                pendingMsg: (messageStateStore.pendingMsg ?? "") + msg?.message
            })

            // 只有在聊天场景下，才需要更新最后一条消息
            if (messageStateStore.taskType === TASK_TYPE.CHAT) {
                if (messageStateStore.pendingFirstToken) {
                    const lastReplyMessage = messageStateStore.pendingReplyMsg

                    lastReplyMessage.data.content =
                        lastReplyMessage?.data?.content + msg?.message

                    chatStore.setMessages([...chatStore.messages, { ...lastReplyMessage }])

                    // 更新消息之后滚动到底部
                    setTimeout(() => {
                        scrollToBottom()
                    }, 1000)
                } else {
                    const lastMessage = chatStore.messages.at(-1)
                    const savedMessage = chatStore.messages.slice(0, -1)

                    lastMessage.data.content = lastMessage?.data?.content + msg?.message
                    chatStore.setMessages([...chatStore.messages, { ...lastMessage }])

                    // 更新消息之后滚动到底部
                    setTimeout(() => {
                        scrollToBottom()
                    }, 1000)
                }
            }

            // 已经收到消息，将 pendingFirstToken 设置为 false
            if (messageStateStore.pendingFirstToken) {
                messageStateStore.setMessageState({ pendingFirstToken: false })
            }
        })
    }

    useEffect(() => {
        bindExtensionPorts();
    }, [])

    return {
        buildQuickActionTaskAndGenReponse,
        buildGenTitleTaskAndGenResponse,
        buildChatTaskAndGenReponse,
        buildIntentChatTaskAndGenReponse,
        buildIntentQuickActionTaskAndGenReponse,
        buildIntentTaskAndGenReponse,
        buildShutdownTaskAndGenResponse,
    }
}
